/**
 * Order-independent randomness per grid cell: the value at (x, y) depends only on the world seed
 * and the cell, never on which cells were generated first. An infinite, streamed, multiplayer
 * world needs this (design doc sections 1, 17); a sequential RNG would make the world depend on
 * the order the player dug in.
 *
 * Hash: integer mix in the style of murmur3's finaliser.
 */
import { toUint32 } from './seededRandom'

export function hashCell(worldSeed: number, x: number, y: number): number {
  let h = toUint32(worldSeed)
  h = mixIn(h, x)
  h = mixIn(h, y)
  return finalise(h)
}

/** Deterministic float in [0, 1) for a cell. */
export function cellRandomFloat(worldSeed: number, x: number, y: number): number {
  return hashCell(worldSeed, x, y) / 4294967296
}

function mixIn(hash: number, value: number): number {
  let k = Math.imul(toUint32(value), 0xcc9e2d51)
  k = (k << 15) | (k >>> 17)
  k = Math.imul(k, 0x1b873593)
  let h = hash ^ k
  h = (h << 13) | (h >>> 19)
  return (Math.imul(h, 5) + 0xe6546b64) >>> 0
}

function finalise(hash: number): number {
  let h = hash
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
