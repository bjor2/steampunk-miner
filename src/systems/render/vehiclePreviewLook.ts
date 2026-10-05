/**
 * The Upgrade bay's live preview as a picture (#44, #39): the run vehicle's own parts (the
 * `vehicle` asset at a visual tier, `vehicleLook`) posed facing right with the drill head out in
 * front, which part each track lights up, and the camera zoom that frames the whole visual
 * vehicle at 60% of the preview panel's height. A dedicated rig over the same parts, not a clone
 * of the run renderer: no world, no camera roll, no physics.
 */
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { PREVIEW_VEHICLE_SHARE_PERCENT } from '../../constants/scene'
import { slotOfPartId } from '../art/artIds'
import type { AssetQuad } from '../art/assetLook'
import type { UpgradeId } from '../economy/economyDefinition'
import { drillHeadQuadsOf, drillHeadSizeOf, vehicleBodyQuadsOf } from './vehicleLook'

/** The box the drawn parts cover, in metres from the body's centre. */
export interface PreviewBounds {
  left: number
  bottom: number
  right: number
  top: number
}

export interface PreviewPanelSize {
  widthPixels: number
  heightPixels: number
}

/** The part each track's icon maps to on the vehicle (#44 icon table); hull lights the chassis too, since tier 1 has no plates. */
const PARTS_OF_TRACK: Readonly<Record<UpgradeId, readonly string[]>> = {
  drill_power: ['motor-housing'],
  drill_tip: ['drill-bit'],
  engine: ['wheel', 'piston'],
  boiler: ['boiler', 'stack'],
  cargo_hold: ['hopper'],
  hull: ['armour-plate', 'chassis'],
}

/** The vehicle may not fill more of the panel's width than this, so the drill never clips. */
const MAX_WIDTH_SHARE = 0.9

/** A repeated part (`wheel-2`) is the same part as its first (`wheel`). */
const REPEAT_SUFFIX = /-\d+$/

/** How far right of the body's centre the drill head sits when it faces right (`DrillHeadView`). */
export function drillHeadReachOf(visualTier: number): number {
  return (VEHICLE_COLLIDER_SIZE + drillHeadSizeOf(visualTier)) / 2
}

export function isPartOfTrack(quad: AssetQuad, upgradeId: UpgradeId | null): boolean {
  if (upgradeId === null) return false
  return PARTS_OF_TRACK[upgradeId].includes(slotOfPartId(quad.partId).replace(REPEAT_SUFFIX, ''))
}

/** The box round every part drawn at a tier: the body's and the drill head's out in front. */
export function previewBoundsOf(visualTier: number): PreviewBounds {
  const reach = drillHeadReachOf(visualTier)
  const head = drillHeadQuadsOf(visualTier).map((quad) => shiftedRight(quad, reach))
  return boundsOf([...vehicleBodyQuadsOf(visualTier), ...head])
}

/**
 * Pixels per metre for the preview's orthographic camera: the visual vehicle at 60% of the panel
 * height (#39), narrowed only if a panel is too slim for the vehicle's length.
 */
export function previewZoomOf(bounds: PreviewBounds, panel: PreviewPanelSize): number {
  const byHeight = (panel.heightPixels * PREVIEW_VEHICLE_SHARE_PERCENT) / 100 / heightOf(bounds)
  const byWidth = (panel.widthPixels * MAX_WIDTH_SHARE) / widthOf(bounds)
  return Math.min(byHeight, byWidth)
}

/** The share of the panel height the visual vehicle covers at a zoom: what the framing check reads. */
export function previewVehicleShareOf(
  bounds: PreviewBounds,
  zoom: number,
  panelHeightPixels: number,
): number {
  return panelHeightPixels > 0 ? (heightOf(bounds) * zoom) / panelHeightPixels : 0
}

/** The point the camera looks at: the middle of the drawn parts. */
export function previewCentreOf(bounds: PreviewBounds): readonly [number, number] {
  return [(bounds.left + bounds.right) / 2, (bounds.bottom + bounds.top) / 2]
}

function shiftedRight(quad: AssetQuad, reach: number): AssetQuad {
  return { ...quad, centre: [quad.centre[0] + reach, quad.centre[1]] }
}

function boundsOf(quads: readonly AssetQuad[]): PreviewBounds {
  return {
    left: Math.min(...quads.map((quad) => quad.centre[0] - quad.size[0] / 2)),
    bottom: Math.min(...quads.map((quad) => quad.centre[1] - quad.size[1] / 2)),
    right: Math.max(...quads.map((quad) => quad.centre[0] + quad.size[0] / 2)),
    top: Math.max(...quads.map((quad) => quad.centre[1] + quad.size[1] / 2)),
  }
}

function heightOf(bounds: PreviewBounds): number {
  return bounds.top - bounds.bottom
}

function widthOf(bounds: PreviewBounds): number {
  return bounds.right - bounds.left
}
