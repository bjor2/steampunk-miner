/**
 * Base64 (RFC 4648, padded) for the codex's `ore` bitsets (#178 VS: "bitset stores base64 bytes").
 * Written by hand, integer-only, so the authority never reaches for `btoa`/`Buffer` and every
 * platform encodes the same bytes to the same text.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const PAD = '='
const BYTES_PER_GROUP = 3
const CHARS_PER_GROUP = 4

export function base64OfBytes(bytes: Uint8Array): string {
  let text = ''
  for (let start = 0; start < bytes.length; start += BYTES_PER_GROUP) {
    text += groupOf(bytes, start)
  }
  return text
}

/** The bytes the text encodes; null for text that is not canonical padded base64. */
export function bytesOfBase64(text: string): Uint8Array | null {
  if (text.length % CHARS_PER_GROUP !== 0) return null
  const bytes = decodedBytesOf(text)
  if (bytes === null || base64OfBytes(bytes) !== text) return null
  return bytes
}

/** Up to three bytes as four characters, padded at the end of the bytes. */
function groupOf(bytes: Uint8Array, start: number): string {
  const count = Math.min(BYTES_PER_GROUP, bytes.length - start)
  const b0 = bytes[start]
  const b1 = count > 1 ? bytes[start + 1] : 0
  const b2 = count > 2 ? bytes[start + 2] : 0
  const sextets = [b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63]
  return sextets.map((sextet, at) => (at <= count ? ALPHABET[sextet] : PAD)).join('')
}

function decodedBytesOf(text: string): Uint8Array | null {
  const padding = paddingOf(text)
  const byteCount = (text.length / CHARS_PER_GROUP) * BYTES_PER_GROUP - padding
  const bytes = new Uint8Array(Math.max(0, byteCount))
  let bits = 0
  let bitCount = 0
  let written = 0
  for (let at = 0; at < text.length - padding; at += 1) {
    const sextet = ALPHABET.indexOf(text[at])
    if (sextet < 0) return null
    bits = ((bits << 6) | sextet) & 0xffffff
    bitCount += 6
    if (bitCount < 8) continue
    bitCount -= 8
    if (written < bytes.length) bytes[written] = (bits >> bitCount) & 255
    written += 1
  }
  return bytes
}

/** 0, 1 or 2 trailing `=`. */
function paddingOf(text: string): number {
  if (text.endsWith(PAD + PAD)) return 2
  return text.endsWith(PAD) ? 1 : 0
}
