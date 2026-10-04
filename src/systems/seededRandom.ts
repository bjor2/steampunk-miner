/**
 * Seeded, deterministic random numbers (design doc sections 19-20, 28: same seed, same world).
 * mulberry32 by Tommy Ettinger (public domain): 32-bit state, fast, good enough for gameplay
 * generation. Not for cryptography.
 */

export interface SeededRandom {
  /** Next float in [0, 1). */
  nextFloat(): number
  /** Next integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = toUint32(seed)
  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    nextFloat,
    nextInt: (maxExclusive) => Math.floor(nextFloat() * maxExclusive),
  }
}

export function toUint32(seed: number): number {
  return seed >>> 0
}
