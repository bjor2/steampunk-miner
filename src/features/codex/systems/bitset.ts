/**
 * A set of whole numbers as bytes, bit `i` in byte `i >> 3` at mask `1 << (i & 7)`: the shape of
 * the codex's `ore` bitsets (#178 VS). Bits are only ever set, and the bytes stop at the last one
 * holding a bit, so one set has one encoding and the digest hashes it as is.
 */

export function hasBit(bytes: Uint8Array, index: number): boolean {
  const byte = index >> 3
  return byte < bytes.length && (bytes[byte] & maskOf(index)) !== 0
}

/** The bytes with `index` set, grown to hold it; the same bytes when it already was. */
export function withBit(bytes: Uint8Array, index: number): Uint8Array {
  if (hasBit(bytes, index)) return bytes
  const grown = new Uint8Array(Math.max(bytes.length, (index >> 3) + 1))
  grown.set(bytes)
  grown[index >> 3] |= maskOf(index)
  return grown
}

/** Every set bit, ascending. */
export function setBitsOf(bytes: Uint8Array): number[] {
  const bits: number[] = []
  bytes.forEach((byte, at) => {
    for (let bit = 0; bit < 8; bit += 1) {
      if ((byte & (1 << bit)) !== 0) bits.push(at * 8 + bit)
    }
  })
  return bits
}

/** The bytes holding exactly these bits. */
export function bitsetOf(bits: readonly number[]): Uint8Array {
  return bits.reduce(withBit, new Uint8Array(0))
}

/** Whether every bit of `inner` is set in `outer`. */
export function isSubsetOf(inner: Uint8Array, outer: Uint8Array): boolean {
  return inner.every((byte, at) => (byte & ~(outer[at] ?? 0)) === 0)
}

/** Whether the last byte holds no bit, so the bytes are not the set's one encoding. */
export function endsInEmptyByte(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes[bytes.length - 1] === 0
}

function maskOf(index: number): number {
  return 1 << (index & 7)
}
