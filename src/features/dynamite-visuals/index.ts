/**
 * The dynamite-visuals slice's public API (docs/standards/feature-slices.md 2.1): every dynamite
 * look, from the rack and the planted prop to the blast VFX (#145, the TD lock), and the typed
 * look rows of D7 (ticket 866) for the per-upgrade looks check. Pure rules and constants only; the
 * slice draws them itself through its registrations (#215).
 */
export const DYNAMITE_VISUALS_SLICE_ID = 'dynamite-visuals'
export type { BlastCue } from './systems/render/blastCue'
export { blastCueOf, cueShareAtDistance, thumpDelayTicksOf } from './systems/render/blastCue'
export type { BlastFlash, BlastFrontLook, BlastRing } from './systems/render/blastFrontLook'
export {
  blastFrontLookOf,
  blastRingOf,
  debrisCountOf,
  dustCountOf,
  fireCountOf,
  rimTilesOf,
} from './systems/render/blastFrontLook'
export {
  BLAST_DEBRIS_CAPACITY,
  CUE_REACH_RADII,
  FLASH_FRAMES,
} from './systems/render/blastLookConstants'
export type { ChargeTypeLookRow, DynamiteLookTable } from './systems/render/dynamiteLookTable'
export { dynamiteLookTableProblemsOf } from './systems/render/dynamiteLookTable'
export {
  chargeTypeLookOf,
  chargeTypes,
  craterLookOf,
  DYNAMITE_LOOKS,
  placedRingLookOf,
  radiusBandOf,
  radiusGrowthOf,
} from './systems/render/chargeTypeLook'
