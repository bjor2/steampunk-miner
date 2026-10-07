/**
 * The dock buildings slice's public API (docs/standards/feature-slices.md 2.1): the only file
 * another slice may import from this folder.
 */
export const DOCK_BUILDINGS_SLICE_ID = 'dock-buildings'
export {
  ROLL_TICKS,
  SHOWCASE_CAMERA_TICKS,
  workshopStagingOf,
  type WorkshopRollPoints,
} from './systems/render/workshopStaging'
