/**
 * Bytes as base64 text (RFC 4648 section 4, with `=` padding), so the packed chunk table (#401 VS2)
 * sits in the save's JSON as one string. Written here rather than with `btoa`, which takes a
 * binary string a megabyte table would first have to be built into.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const PAD = '='
const SIX_BITS = 64
/** Chars turned into a string at once: well under every engine's argument limit. */
const CHARS_PER_PIECE = 8192

const VALUE_OF_CHAR = new Map([...ALPHABET].map((char, value) => [char.charCodeAt(0), value]))

export function encodeBase64(bytes: Uint8Array): string {
  const codes = new Uint16Array(Math.ceil(bytes.length / 3) * 4)
  for (let from = 0, to = 0; from < bytes.length; from += 3, to += 4) {
    writeQuantum(bytes, from, codes, to)
  }
  return textOfCodes(codes)
}

function writeQuantum(bytes: Uint8Array, from: number, codes: Uint16Array, to: number): void {
  const left = bytes.length - from
  const triple = (bytes[from] << 16) | ((bytes[from + 1] ?? 0) << 8) | (bytes[from + 2] ?? 0)
  codes[to] = ALPHABET.charCodeAt(triple >>> 18)
  codes[to + 1] = ALPHABET.charCodeAt((triple >>> 12) % SIX_BITS)
  codes[to + 2] = left > 1 ? ALPHABET.charCodeAt((triple >>> 6) % SIX_BITS) : PAD.charCodeAt(0)
  codes[to + 3] = left > 2 ? ALPHABET.charCodeAt(triple % SIX_BITS) : PAD.charCodeAt(0)
}

function textOfCodes(codes: Uint16Array): string {
  const pieces: string[] = []
  for (let at = 0; at < codes.length; at += CHARS_PER_PIECE) {
    pieces.push(String.fromCharCode(...codes.subarray(at, at + CHARS_PER_PIECE)))
  }
  return pieces.join('')
}

/** The bytes, or null for text that is not padded base64 of this alphabet. */
export function decodeBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null
  const padding = paddingOf(text)
  const bytes = new Uint8Array((text.length / 4) * 3 - padding)
  for (let from = 0, to = 0; from < text.length; from += 4, to += 3) {
    if (!readQuantum(text, from, bytes, to)) return null
  }
  return bytes
}

function paddingOf(text: string): number {
  if (text.endsWith(PAD + PAD)) return 2
  return text.endsWith(PAD) ? 1 : 0
}

function readQuantum(text: string, from: number, bytes: Uint8Array, to: number): boolean {
  const values = [0, 1, 2, 3].map((offset) => valueAt(text, from + offset, bytes.length - to))
  if (values.some((value) => value === null)) return false
  const [a, b, c, d] = values as number[]
  const triple = (a << 18) | (b << 12) | (c << 6) | d
  bytes[to] = triple >>> 16
  if (to + 1 < bytes.length) bytes[to + 1] = (triple >>> 8) % 256
  if (to + 2 < bytes.length) bytes[to + 2] = triple % 256
  return true
}

/** A char's six bits; padding reads 0 only where the last quantum lacks bytes. */
function valueAt(text: string, at: number, bytesLeft: number): number | null {
  const offset = at % 4
  if (text[at] === PAD) return offset > bytesLeft ? 0 : null
  return VALUE_OF_CHAR.get(text.charCodeAt(at)) ?? null
}
