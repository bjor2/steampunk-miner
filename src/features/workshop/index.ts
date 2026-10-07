/**
 * The workshop slice's public API (docs/standards/feature-slices.md 2.1): the only file another
 * slice may import from this folder. The Workshop redo of #180 (ticket 177): the hold-to-buy
 * chain on its client-only curve, what a held chain could buy now, and the escalating purchase
 * sound with its voice cap.
 */
export const WORKSHOP_SLICE_ID = 'workshop'
export {
  HOLD_CURVE,
  holdStepTicks,
  isChainLive,
  isStepDue,
  landStep,
  leaveHoldFocus,
  pressHoldChain,
  refuseStep,
  releaseHoldChain,
  type ChainEnd,
  type HoldChain,
  type HoldCurve,
  type StepLanding,
} from './systems/holdChain'
export { momentOf, stopCueOf, type ChainStopCue, type StepMoment } from './systems/chainCues'
export {
  chainPreviewOf,
  heldStepStopOf,
  PREVIEW_STEP_LIMIT,
  type ChainPreview,
  type ChainPreviewStop,
} from './systems/chainPreview'
export {
  PURCHASE_SOUND,
  ratchetLayersOf,
  ratchetSemitonesOf,
  SILENT_PURCHASE_VOICES,
  soundingVoicesAt,
  startFlourish,
  startRatchet,
  steamBedLevelOf,
  type PurchaseSound,
  type PurchaseVoice,
  type PurchaseVoices,
  type RatchetStart,
} from './systems/render/purchaseSound'
