/**
 * Generator sub-seeds (decision #4): `subSeed = hash(planetSeed, purposeId)`, one per thing the
 * generator decides, so changing how ore is placed never moves the caves. Purpose ids are part of
 * the generator output: renumbering one needs a GENERATOR_VERSION bump.
 */
import { hashCell } from '../cellRandom'
import type { PlanetParams } from './planetParams'

// Ids 1, 2 and 5 placed ore tile by tile under generator 1; ore patches (#42) replaced them.
export const SEED_PURPOSE = {
  cave: 3,
  starterVein: 4,
  /** Enemy spawn points (#9): placed on generated cells, never changing them. */
  enemySpawn: 6,
  /** Ore patch stamps (#42). */
  orePatch: 7,
} as const

export type SeedPurpose = (typeof SEED_PURPOSE)[keyof typeof SEED_PURPOSE]

export function subSeedFor(params: PlanetParams, purpose: SeedPurpose): number {
  return hashCell(params.planetSeed, purpose, 0)
}
