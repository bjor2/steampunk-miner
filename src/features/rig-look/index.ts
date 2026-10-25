/**
 * The rig look slice's public API (docs/standards/feature-slices.md 2.1): the per-track look rows,
 * the pure index and frame rules, and the shipped table's answers (the look, the plaque's fact). Never React, zustand or a store
 * object.
 */
export const RIG_LOOK_SLICE_ID = 'rig-look'
export type {
  RigLookBand,
  RigLookFinish,
  RigLookIndex,
  RigLookPlaque,
  RigLookStepRow,
  TrackLookRows,
} from './systems/render/rigLookIndex'
export { lookPurchasesOf, rigLookIndexOf } from './systems/render/rigLookIndex'
export type { RigLookFrame, TrackLookFrames } from './systems/render/rigLookFrames'
export { lookFrameAt } from './systems/render/rigLookFrames'
export {
  rigLookOf,
  rigLookPlaqueFactOf,
  SHIPPED_RIG_LOOKS,
  trackLookFramesOf,
  type RigLooks,
} from './systems/rigLooks'
/** The swaps owned looks ask for, for the rig gear's cover checks (ticket 892). */
export { partSwapsOf } from './systems/render/rigLookParts'
export { ownedPurchasesOf, rigLookOfPlayer, rigLookSourceIdOf } from './systems/rigLookSource'
