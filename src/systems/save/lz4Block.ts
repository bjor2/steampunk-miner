/**
 * The LZ4 block format (lz4/lz4 `doc/lz4_Block_format.md`, v1.6.2), ported for the packed chunk
 * table (#401 VS2): a dug chunk's density runs repeat the stamp's soft rim every few samples, which
 * run-length coding leaves alone and a match against the bytes just written takes whole.
 *
 * A block is a list of sequences: a token (high 4 bits the literal count, low 4 bits the match
 * length minus 4, 15 meaning more length bytes of up to 255 follow), the literals, then a 2-byte
 * little-endian offset back into what was decoded. The last sequence is literals only. As the format
 * asks, the last 5 bytes are always literals and no match starts within the last 12 bytes.
 *
 * The compressor is a greedy single-pass one with a 4-byte hash (the reference "fast" shape, with
 * no acceleration). It is deterministic: the same bytes always give the same block. The block does
 * not hold its decoded size, so the caller keeps it beside the block.
 */

const MIN_MATCH = 4
const LAST_LITERALS = 5
const MATCH_FIND_LIMIT = 12
const MAX_OFFSET = 65535
const NIBBLE_MAX = 15
const LENGTH_BYTE_MAX = 255
const HASH_BITS = 16
/** Knuth's multiplicative hash constant, as the reference compressor hashes 4-byte sequences. */
const HASH_PRIME = 2654435761

interface BlockWriter {
  out: Uint8Array
  length: number
}

export function compressLz4Block(input: Uint8Array): Uint8Array {
  const writer: BlockWriter = { out: new Uint8Array(worstBlockSize(input.length)), length: 0 }
  const lastLiterals = writeSequences(input, writer)
  writeSequence(writer, input, lastLiterals, input.length, null)
  return writer.out.slice(0, writer.length)
}

/** Every literal, its token and its length bytes: what an incompressible input grows to. */
function worstBlockSize(size: number): number {
  return size + Math.floor(size / LENGTH_BYTE_MAX) + 16
}

/** Writes every match sequence; answers where the trailing literals start. */
function writeSequences(input: Uint8Array, writer: BlockWriter): number {
  const lastMatchStart = input.length - MATCH_FIND_LIMIT
  const matchEndLimit = input.length - LAST_LITERALS
  const table = new Int32Array(1 << HASH_BITS).fill(-1)
  let anchor = 0
  let at = 0
  while (at <= lastMatchStart) {
    const candidate = swapHashed(table, input, at)
    if (!isMatchAt(input, candidate, at)) {
      at++
      continue
    }
    const length = matchLengthOf(input, candidate, at, matchEndLimit)
    writeSequence(writer, input, anchor, at, { offset: at - candidate, length })
    at += length
    anchor = at
  }
  return anchor
}

/** The last position whose 4 bytes hashed like these, and this position put in its place. */
function swapHashed(table: Int32Array, input: Uint8Array, at: number): number {
  const hash = Math.imul(fourBytesAt(input, at), HASH_PRIME | 0) >>> (32 - HASH_BITS)
  const candidate = table[hash]
  table[hash] = at
  return candidate
}

function isMatchAt(input: Uint8Array, candidate: number, at: number): boolean {
  if (candidate < 0 || at - candidate > MAX_OFFSET) return false
  return fourBytesAt(input, candidate) === fourBytesAt(input, at)
}

function fourBytesAt(input: Uint8Array, at: number): number {
  return (input[at] | (input[at + 1] << 8) | (input[at + 2] << 16) | (input[at + 3] << 24)) >>> 0
}

function matchLengthOf(input: Uint8Array, candidate: number, at: number, endLimit: number): number {
  let length = MIN_MATCH
  while (at + length < endLimit && input[candidate + length] === input[at + length]) length++
  return length
}

function writeSequence(
  writer: BlockWriter,
  input: Uint8Array,
  from: number,
  to: number,
  match: { offset: number; length: number } | null,
): void {
  const literals = to - from
  const matchExtra = match === null ? 0 : match.length - MIN_MATCH
  writeByte(writer, (Math.min(literals, NIBBLE_MAX) << 4) | Math.min(matchExtra, NIBBLE_MAX))
  writeLengthBytes(writer, literals)
  writer.out.set(input.subarray(from, to), writer.length)
  writer.length += literals
  if (match === null) return
  writeByte(writer, match.offset & 0xff)
  writeByte(writer, match.offset >>> 8)
  writeLengthBytes(writer, matchExtra)
}

/** The bytes past a nibble of 15: 255 each, then the rest below 255. */
function writeLengthBytes(writer: BlockWriter, length: number): void {
  if (length < NIBBLE_MAX) return
  let rest = length - NIBBLE_MAX
  while (rest >= LENGTH_BYTE_MAX) {
    writeByte(writer, LENGTH_BYTE_MAX)
    rest -= LENGTH_BYTE_MAX
  }
  writeByte(writer, rest)
}

function writeByte(writer: BlockWriter, byte: number): void {
  writer.out[writer.length++] = byte
}

interface BlockReader {
  block: Uint8Array
  at: number
}

/** The `size` bytes the block decodes to, or null for a block that is cut short or malformed. */
export function decompressLz4Block(block: Uint8Array, size: number): Uint8Array | null {
  const out = new Uint8Array(size)
  const reader: BlockReader = { block, at: 0 }
  let written = 0
  while (reader.at < block.length) {
    const token = block[reader.at++]
    written = copyLiterals(reader, out, written, readLength(reader, token >>> 4))
    if (written < 0) return null
    if (reader.at === block.length) break
    written = copyMatch(reader, out, written, token & NIBBLE_MAX)
    if (written < 0) return null
  }
  return written === size ? out : null
}

/** A nibble's length with its extra bytes, or -1 when the block ends inside them. */
function readLength(reader: BlockReader, nibble: number): number {
  if (nibble < NIBBLE_MAX) return nibble
  let length = nibble
  let byte = LENGTH_BYTE_MAX
  while (byte === LENGTH_BYTE_MAX) {
    if (reader.at >= reader.block.length) return -1
    byte = reader.block[reader.at++]
    length += byte
  }
  return length
}

/** Where writing goes on after the literals, or -1 when they run past the block or the output. */
function copyLiterals(
  reader: BlockReader,
  out: Uint8Array,
  written: number,
  count: number,
): number {
  const isInside = count >= 0 && reader.at + count <= reader.block.length
  if (!isInside || written + count > out.length) return -1
  out.set(reader.block.subarray(reader.at, reader.at + count), written)
  reader.at += count
  return written + count
}

/** Where writing goes on after the match; -1 for an offset outside what is decoded. */
function copyMatch(reader: BlockReader, out: Uint8Array, written: number, nibble: number): number {
  if (reader.at + 2 > reader.block.length) return -1
  const offset = reader.block[reader.at] | (reader.block[reader.at + 1] << 8)
  reader.at += 2
  const extra = readLength(reader, nibble)
  const length = extra + MIN_MATCH
  if (offset === 0 || offset > written || extra < 0 || written + length > out.length) return -1
  // Byte by byte: a match may overlap the bytes it is writing (a run repeats its own start).
  for (let index = 0; index < length; index++) out[written + index] = out[written + index - offset]
  return written + length
}
