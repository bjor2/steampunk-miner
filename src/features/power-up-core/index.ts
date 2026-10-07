/**
 * The power-up core slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. Item slices register `power-up` entries of these types beside their
 * `vehicle-item` rows, and read charges through `chargesLeftOf` (#162 "Slice and contract"). An
 * effect that outlasts its use, or a passive's, reads the item at the player's Mark through
 * `powerUpAtMarkOf` (#249).
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
export { chargesLeftOf, type FollowUpPattern } from './systems/chargeState'
export { FOLLOW_UP_WINDOW_TICKS } from './systems/followUps'
export { powerUpAtMarkOf, type MarkedPowerUp } from './systems/powerUpMarks'
export { returnCharge } from './systems/useResolution'
export { fireSiblingLinkAt, type LinkMoment } from './systems/siblingLink'
export { toggleDrawQuantaOf } from './systems/toggleDraw'
export {
  DRILL_GEAR_SOCKETS,
  POWER_UP_SLOTS,
  type DrillGearSocket,
  type PowerUpSlot,
  type PressableSlot,
} from './systems/powerUpSlots'
export { intentToHoldSlot, intentToUseSlot } from './systems/slotUse'
export { isToggleEngaged } from './systems/toggleRead'
