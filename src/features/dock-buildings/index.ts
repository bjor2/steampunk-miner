/**
 * The dock buildings slice's public API (docs/standards/feature-slices.md 2.1): the only file
 * another slice may import from this folder. The Workshop auto-roll (#170) and the in-place dock
 * add-ons of the #170 amendment (#197): which stand on a planet, where, and the unlock pan.
 */
export const DOCK_BUILDINGS_SLICE_ID = 'dock-buildings'
export {
  ROLL_TICKS,
  SHOWCASE_CAMERA_TICKS,
  workshopStagingOf,
  type WorkshopRollPoints,
} from './systems/render/workshopStaging'
export {
  DOCK_ADD_ON_IDS,
  DOCK_ADD_ONS,
  MAX_DOCK_ADD_ON_PARTS,
  dockAddOnAssetIdOf,
  dockAddOnOfRow,
  dockAddOnPartIdsOf,
  standingDockAddOnsOf,
  type DockAddOn,
  type DockAddOnId,
  type DockAddOnLayer,
} from './systems/dockAddOns'
export { dockAddOnLookPointOf, dockAddOnOriginOf } from './systems/render/dockAddOnPlacement'
export {
  PAN_HOLD_TICKS,
  PAN_IN_TICKS,
  PAN_OUT_TICKS,
  PAN_TICKS,
  isUnlockPanOver,
  unlockPanStagingOf,
  type UnlockPan,
} from './systems/render/unlockPan'
