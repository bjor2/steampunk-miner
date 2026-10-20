/**
 * The rig look slice's public API (docs/standards/feature-slices.md 2.1): the per-track look rows,
 * the pure index and frame rules, and the shipped table's answer. Never React, zustand or a store
 * object.
 */
export const RIG_LOOK_SLICE_ID = 'rig-look'
export type {
  RigLookIndex,
  RigLookStepRow,
  RigLookTail,
  TrackLookRows,
} from './systems/render/rigLookIndex'
export { lookPurchasesOf, rigLookIndexOf } from './systems/render/rigLookIndex'
export type { RigLookFrame, TrackLookFrames } from './systems/render/rigLookFrames'
export { lookFrameAt } from './systems/render/rigLookFrames'
export { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './systems/rigLooks'
export { ownedPurchasesOf, rigLookOfPlayer, rigLookSourceIdOf } from './systems/rigLookSource'
