/**
 * The seeded draws of a system's roster (ticket 775, P&N: "all picks come from
 * hash(systemSeed, p, slot); nothing is authored per system"). A planet's draws hash its address
 * seed `planetSeedAt(worldSeed, s, p)` (the TD architecture in the GD lock on #650) with one stream
 * per slot, so every pick depends on the world seed and the address alone, never on the order the
 * roster was read in. A draw that belongs to the whole system (the slot shuffle, a look walk's
 * start) hashes the seed of the planet that opens it, under its own stream.
 */
import { hashCell } from '../../../systems/cellRandom'
import { planetSeedAt } from '../../../systems/starMap/planetAddressSeed'

/** One stream per pick; a new pick takes a new number and never moves an old one. */
export const ROSTER_STREAM = {
  prefix: 1,
  noun: 2,
  sizeClass: 3,
  /** The look the first planet of an act in a system starts the act's look walk on. */
  lookWalk: 4,
  /** The per-index rolls of the system's new-content shuffle. */
  slotShuffle: 5,
  /** Where a pool kind's silhouette, pattern and hue slot walks start (ticket 777), by kind index. */
  kindSilhouette: 6,
  kindPattern: 7,
  kindHue: 8,
} as const

export type RosterStream = (typeof ROSTER_STREAM)[keyof typeof ROSTER_STREAM]

/** A planet's draw under a stream: the hash of its address seed, the stream and an index. */
export function rosterDrawOf(
  worldSeed: number,
  system: bigint,
  planet: number,
  stream: RosterStream,
  index = 0,
): number {
  return hashCell(planetSeedAt(worldSeed, system, BigInt(planet)), stream, index)
}

/** The entry a draw picks from a non-empty list. */
export function pickedBy<T>(list: readonly T[], draw: number): T {
  if (list.length === 0) throw new RangeError('nothing to pick from')
  return list[draw % list.length]
}

/**
 * The ordinals `0..count-1` shuffled by one draw per index (Fisher-Yates, from the end), so the
 * permutation is a function of the draws alone.
 */
export function shuffledOrdinalsOf(count: number, drawAt: (index: number) => number): number[] {
  const ordinals = Array.from({ length: count }, (_, at) => at)
  for (let at = count - 1; at > 0; at -= 1) {
    const other = drawAt(at) % (at + 1)
    ;[ordinals[at], ordinals[other]] = [ordinals[other], ordinals[at]]
  }
  return ordinals
}
