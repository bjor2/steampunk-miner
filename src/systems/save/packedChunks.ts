/**
 * The planet's chunk deltas as a save holds them (#401 VS2): the world is seed + params + the
 * deltas of the chunks play changed (`chunkDelta.ts`), so a chunk no one touched is never in it,
 * and a planet left behind leaves nothing at all (`planetEntry.ts`: another planet is another
 * world, #10). The deltas are packed into one table:
 *
 *   bytes    the chunk count, then per chunk its key's chars and each delta list as a count and
 *            its whole numbers (`wholeNumberBytes.ts`): density runs, casing runs, yielded rows,
 *            overrides as flat index-cell pairs, lava flips, then the version
 *   block    those bytes as one LZ4 block (`lz4Block.ts`), so the stamp's rim, repeated down every
 *            tunnel in every chunk, is written once
 *   text     the block as base64 (`base64Text.ts`), beside its chunk count and decoded size
 *
 * What a delta holds is what was cut, not how fast: the size follows the cells changed. Unpacking
 * gives back the same deltas in the same order, so the state digest checks the load as before.
 */
import type { ChunkDelta } from '../world/chunkDelta'
import { decodeBase64, encodeBase64 } from './base64Text'
import { compressLz4Block, decompressLz4Block } from './lz4Block'
import {
  createByteReader,
  createByteWriter,
  type ByteReader,
  type ByteWriter,
} from './wholeNumberBytes'

export type ChunkDeltas = Record<string, ChunkDelta>

export interface PackedChunks {
  /** How many chunk deltas the table holds. */
  chunks: number
  /** The size of the packed bytes before the LZ4 block. */
  bytes: number
  /** The LZ4 block, as base64. */
  lz4: string
}

export type ChunkUnpacking = { chunks: ChunkDeltas; problems: [] } | { problems: string[] }

export function packChunkDeltas(chunks: ChunkDeltas): PackedChunks {
  const entries = Object.entries(chunks)
  const bytes = bytesOfChunkDeltas(entries)
  return { chunks: entries.length, bytes: bytes.length, lz4: encodeBase64(compressLz4Block(bytes)) }
}

function bytesOfChunkDeltas(entries: readonly [string, ChunkDelta][]): Uint8Array {
  const writer = createByteWriter()
  writer.writeWhole(entries.length)
  for (const [key, delta] of entries) writeChunkDelta(writer, key, delta)
  return writer.bytes()
}

function writeChunkDelta(writer: ByteWriter, key: string, delta: ChunkDelta): void {
  writer.writeWholeList([...key].map((char) => char.charCodeAt(0)))
  writer.writeWholeList(delta.density)
  writer.writeWholeList(delta.casing)
  writer.writeWholeList(delta.yieldedRows)
  writer.writeWholeList(delta.overrides.flat())
  writer.writeWholeList(delta.lavaFlips)
  writer.writeWhole(delta.version)
}

/** The deltas the table packs, or why it cannot be read; `readSnapshot` checks their shape. */
export function unpackChunkDeltas(packed: unknown): ChunkUnpacking {
  if (!isPackedChunks(packed)) return { problems: [PACKED_SHAPE_PROBLEM] }
  const bytes = bytesOfPackedChunks(packed)
  const chunks = bytes === null ? null : chunkDeltasOf(bytes, packed.chunks)
  if (chunks === null) return { problems: ['save.world.chunks does not unpack to its chunks'] }
  return { chunks, problems: [] }
}

/** Longer than any `cx,cy` key of a safe-integer chunk: a longer one is a corrupt table. */
const MAX_KEY_CHARS = 64

const PACKED_SHAPE_PROBLEM =
  'save.world.chunks must hold a chunk count, a byte size and an LZ4 block as base64'

function isPackedChunks(packed: unknown): packed is PackedChunks {
  if (typeof packed !== 'object' || packed === null) return false
  const { chunks, bytes, lz4 } = packed as Record<string, unknown>
  return isCount(chunks) && isCount(bytes) && typeof lz4 === 'string'
}

function isCount(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function bytesOfPackedChunks(packed: PackedChunks): Uint8Array | null {
  const block = decodeBase64(packed.lz4)
  return block === null ? null : decompressLz4Block(block, packed.bytes)
}

function chunkDeltasOf(bytes: Uint8Array, count: number): ChunkDeltas | null {
  const reader = createByteReader(bytes)
  if (reader.readWhole() !== count) return null
  const chunks: ChunkDeltas = {}
  for (let index = 0; index < count; index++) {
    const entry = readChunkDelta(reader)
    if (entry === null) return null
    chunks[entry.key] = entry.delta
  }
  return reader.isAtEnd() && Object.keys(chunks).length === count ? chunks : null
}

function readChunkDelta(reader: ByteReader): { key: string; delta: ChunkDelta } | null {
  const key = reader.readWholeList()
  const lists = [0, 1, 2, 3, 4].map(() => reader.readWholeList())
  const version = reader.readWhole()
  if (key === null || key.length > MAX_KEY_CHARS) return null
  if (version === null || lists.some((list) => list === null)) return null
  const [density, casing, yieldedRows, flatOverrides, lavaFlips] = lists as number[][]
  if (flatOverrides.length % 2 !== 0) return null
  const overrides = pairsOf(flatOverrides)
  const delta = { density, casing, yieldedRows, overrides, lavaFlips, version }
  return { key: String.fromCharCode(...key), delta }
}

function pairsOf(flat: readonly number[]): [index: number, cell: number][] {
  const pairs: [number, number][] = []
  for (let at = 0; at < flat.length; at += 2) pairs.push([flat[at], flat[at + 1]])
  return pairs
}
