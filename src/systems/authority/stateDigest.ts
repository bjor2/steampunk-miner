/**
 * State digest (decision #11 section 3): FNV-1a 64-bit over the UTF-8 bytes of the canonical
 * JSON, written as 16 hex characters. Computed in two 32-bit lanes so it needs no BigInt and no
 * approximated Math; every intermediate stays below 2^53, so plain number arithmetic is exact.
 */
import { toCanonicalJson } from './canonicalJson'

// FNV-1a 64 constants (offset basis 0xcbf29ce484222325, prime 0x100000001b3 = 2^40 + 0x1b3).
const OFFSET_BASIS_HIGH = 0xcbf29ce4
const OFFSET_BASIS_LOW = 0x84222325
const PRIME_LOW_PART = 0x1b3
const TWO_TO_32 = 0x100000000

const utf8 = new TextEncoder()

export function stateDigest(state: unknown): string {
  return fnv1a64Hex(toCanonicalJson(state))
}

export function fnv1a64Hex(text: string): string {
  let high = OFFSET_BASIS_HIGH
  let low = OFFSET_BASIS_LOW
  for (const byte of utf8.encode(text)) {
    low = (low ^ byte) >>> 0
    ;[high, low] = multiplyByFnvPrime(high, low)
  }
  return toHex32(high) + toHex32(low)
}

/** (high, low) * (2^40 + 0x1b3) mod 2^64. */
function multiplyByFnvPrime(high: number, low: number): [number, number] {
  const lowProduct = low * PRIME_LOW_PART
  const carry = Math.floor(lowProduct / TWO_TO_32)
  const shiftedLow = (low << 8) >>> 0
  const nextHigh = (high * PRIME_LOW_PART + carry + shiftedLow) % TWO_TO_32
  return [nextHigh, lowProduct % TWO_TO_32]
}

function toHex32(lane: number): string {
  return lane.toString(16).padStart(8, '0')
}
