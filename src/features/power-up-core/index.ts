/**
 * The power-up core slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. Item slices register `power-up` entries of these types beside their
 * `vehicle-item` rows, and read charges through `chargesLeftOf` (#162 "Slice and contract").
 */
export const POWER_UP_CORE_SLICE_ID = 'power-up-core'
export {
  MAX_WINDUP_TICKS,
  POWER_UP_CLASSES,
  powerUpOfItem,
  powerUpProblems,
  type GateBlock,
  type PowerUp,
  type PowerUpClass,
  type PowerUpOutcome,
  type PowerUpUse,
  type SlotHold,
} from './systems/powerUpKind'
export { chargesLeftOf } from './systems/chargeState'
export { returnCharge } from './systems/useResolution'
export { toggleDrawQuantaOf } from './systems/toggleDraw'
export { POWER_UP_SLOTS, type PowerUpSlot } from './systems/powerUpSlots'
export { intentToUseSlot } from './systems/slotUse'
export { isToggleEngaged } from './systems/toggleRead'
