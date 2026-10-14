/**
 * Which tiles casing_cement holds as permanent ground (ticket 367, GD ruling B on #367 and the TD
 * lock on #157): a tile is cased when a sample of cement-grade lining (refractory, insulated or
 * grounded: `casing.cementGrades`) lies in it or on its one-sample border. That is a 6x6 window of
 * the casing layer, so a tile in the middle of a lined bore, with no wall sample of its own, is
 * cased too. The standard lining is no grade and cases nothing, so the #43 under-grade hazard stays.
 *
 * Read from the existing casing layer: no section and no save field. Breached lining guards nothing
 * (`casingTypeIndexOf` answers only for intact lining), so a gnawed ring cases nothing either.
 * Ownership is the lining rules' (`BuyLiningType` opens a grade only on its own row, owned or
 * `FeatureUnlocked`; `SelectLiningType` refuses an unowned type), checked when the lining is laid
 * and never here, so a cased tile holds for every player.
 */
import { liningTypes } from '../../../systems/economy/heatEconomy'
import type { CasingCementGrades } from '../../../systems/economy/casingCementGrades'
import { casingTypeIndexOf } from '../../../systems/world/chunkDelta'
import {
  chunkOfSample,
  localSampleOf,
  sampleIndexOf,
  SAMPLES_PER_TILE,
} from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { currentCasingOfChunk, type WorldState } from '../../../systems/world/worldState'

/** The casing layer's value at a world sample. */
export type CasingSampleReader = (sx: number, sy: number) => number

/** Samples past the tile's own on each side that still case it: the one-sample border. */
const CASED_BORDER_SAMPLES = 1

/**
 * Whether `tile` holds or borders a sample of a lining type in `cementTypes` (casing layer type
 * indices). At most 36 samples, whatever the world: O(1) a tile.
 */
export function isTileCasedIn(
  casingAt: CasingSampleReader,
  tile: TilePoint,
  cementTypes: ReadonlySet<number>,
): boolean {
  const fromSx = tile.tx * SAMPLES_PER_TILE - CASED_BORDER_SAMPLES
  const fromSy = tile.ty * SAMPLES_PER_TILE - CASED_BORDER_SAMPLES
  const side = SAMPLES_PER_TILE + 2 * CASED_BORDER_SAMPLES
  for (let dy = 0; dy < side; dy++) {
    for (let dx = 0; dx < side; dx++) {
      if (isCementSample(casingAt(fromSx + dx, fromSy + dy), cementTypes)) return true
    }
  }
  return false
}

/**
 * The casing layer type indices of the cement grades the game has a lining type for: a grade whose
 * act brings no type yet (insulated, grounded) has no index and is skipped.
 */
export function cementTypeIndicesOf(grades: CasingCementGrades): ReadonlySet<number> {
  const types = liningTypes()
  const indices = grades.liningTypes
    .map((type) => types.indexOf(type))
    .filter((index) => index >= 0)
  return new Set(indices)
}

/** The world's casing layer read sample by sample, each chunk's layer looked up as it is met. */
export function worldCasingReader(world: WorldState): CasingSampleReader {
  return (sx, sy) =>
    currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))[
      sampleIndexOf(localSampleOf(sx), localSampleOf(sy))
    ]
}

function isCementSample(casing: number, cementTypes: ReadonlySet<number>): boolean {
  const typeIndex = casingTypeIndexOf(casing)
  return typeIndex !== null && cementTypes.has(typeIndex)
}
