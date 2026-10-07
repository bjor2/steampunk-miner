/**
 * Whether the full plaque fits the top band of this screen (#172 §2 placement, §4 readability):
 * between the banner and whatever is nearer of the vehicle's 3-tile ring and the top of a column
 * of 3 chips rising above a downward drill, at the default 12 m zoom. The UI scales with the
 * short axis (and 4x in TV mode) but the world does not, so a phone held sideways and TV mode
 * leave no room: there the plaque is one line in the bottom band, still outside the ring.
 *
 * Presentation maths over the shell's screen layout (systems/views/screenLayout.ts); the rem
 * sizes are the plaque's and chip's style sheets', measured at 1080p.
 */
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../../../constants/scene'
import type { ScreenLayout } from '../../../../systems/views/screenLayout'
import {
  CHIP_REACH_TILES,
  plaqueBandOf,
  type PlaqueBand,
  type VehicleMotion,
} from './chipPlacement'

export type PlaqueFit = 'full' | 'line'

/** The browser's root font size before `--ui-scale` (base.css: `100% * var(--ui-scale)`). */
const ROOT_FONT_PX = 16
/** NewMaterialPlaque.module.css: the plate's top, under the banner, and its height. */
const PLAQUE_TOP_REM = 3.5
const FULL_PLAQUE_REM = 5.5
/** ResourceChips.module.css: one chip's height, the 115% stack step and the 24 px rise. */
const CHIP_HEIGHT_REM = 1.4
/** The style sheet's `115%`, kept a whole number so the economy scan never takes it for a ratio. */
const CHIP_STACK_STEP_PERCENT = 115
const PERCENT = 100
const CHIP_RISE_PX = 24
const STACKED_CHIPS = 3
/** #172 §2: the plaque stays out of a 3-tile radius round the vehicle. */
const CLEAR_RING_TILES = 3

export function plaqueFitOf(layout: ScreenLayout | null): PlaqueFit {
  if (layout === null) return 'full'
  return fullPlaqueBottomOf(layout) <= topBandFloorOf(layout) ? 'full' : 'line'
}

/** The one-line plaque always takes the bottom band; the full one leaves the top while lifting. */
export function plaqueBandOn(fit: PlaqueFit, motion: VehicleMotion): PlaqueBand {
  return fit === 'line' ? 'bottom' : plaqueBandOf(motion)
}

function fullPlaqueBottomOf({ uiScale, tvSafeInset }: ScreenLayout): number {
  return tvSafeInset.y + (PLAQUE_TOP_REM + FULL_PLAQUE_REM) * ROOT_FONT_PX * uiScale
}

/** Pixels from the top: the nearer of the ring's top and the chip column's top. */
function topBandFloorOf({ stage, uiScale }: ScreenLayout): number {
  const pixelsPerMetre = Math.min(stage.width, stage.height) / VIEW_SHORT_AXIS_DEFAULT_M
  const centre = stage.height / 2
  const ringTop = centre - CLEAR_RING_TILES * pixelsPerMetre
  const chipHeight = CHIP_HEIGHT_REM * ROOT_FONT_PX * uiScale
  const columnHeight =
    (1 / 2 + ((STACKED_CHIPS - 1) * CHIP_STACK_STEP_PERCENT) / PERCENT) * chipHeight
  const columnTop =
    centre - CHIP_REACH_TILES * pixelsPerMetre - columnHeight - CHIP_RISE_PX * uiScale
  return Math.min(ringTop, columnTop)
}
