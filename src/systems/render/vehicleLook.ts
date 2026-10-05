/**
 * The run vehicle's look, read from the `vehicle` asset (#52, #51): until the S7a art lands, the
 * flat-coloured quads of its placeholder sidecar at the authority's visual tier (#7: tier 2 adds
 * side armour and a second stack, tier 3 a bore-collar drill, a second boiler and a second lamp).
 * The drill head and bit ride the swivelling head (#7: it turns to 4 facings), so they are drawn
 * around the head's pivot; every other part is drawn on the body. The art may overhang the 0.9 m
 * collider but never sizes it (#7): physics reads `VEHICLE_COLLIDER_SIZE`, never this file.
 */
import { slotOfPartId } from '../art/artIds'
import { placeholderQuadsOf, type PlaceholderQuad } from '../art/placeholderLook'

export const VEHICLE_ASSET_ID = 'vehicle'

const DRILL_HEAD_SLOT = 'drill-head'

/** The parts the drill head carries: the head plate and the bit. */
function isOnDrillHead(quad: PlaceholderQuad): boolean {
  return slotOfPartId(quad.partId).startsWith('drill-')
}

/** Every part id the run vehicle shows at a visual tier (the debug API's `vehicleParts`). */
export function vehiclePartIdsOf(visualTier: number): string[] {
  return placeholderQuadsOf(VEHICLE_ASSET_ID, visualTier).map((quad) => quad.partId)
}

/** The quads drawn on the body, lowest draw order first. */
export function vehicleBodyQuadsOf(visualTier: number): PlaceholderQuad[] {
  return placeholderQuadsOf(VEHICLE_ASSET_ID, visualTier).filter((quad) => !isOnDrillHead(quad))
}

/**
 * The quads the drill head carries, centred on the head plate's centre and with `z` counted from
 * the plate's, so the swivel can place and turn them as one.
 */
export function drillHeadQuadsOf(visualTier: number): PlaceholderQuad[] {
  const quads = placeholderQuadsOf(VEHICLE_ASSET_ID, visualTier).filter(isOnDrillHead)
  const head = quads.find((quad) => slotOfPartId(quad.partId) === DRILL_HEAD_SLOT)
  if (head === undefined) return []
  return quads.map((quad) => relativeToHead(quad, head))
}

/** The head plate's width, which sets how far ahead of the collider the head reaches. */
export function drillHeadSizeOf(visualTier: number): number {
  const head = drillHeadQuadsOf(visualTier).find((quad) => quad.z === 0)
  return head === undefined ? 0 : head.size[0]
}

function relativeToHead(quad: PlaceholderQuad, head: PlaceholderQuad): PlaceholderQuad {
  return {
    ...quad,
    centre: [quad.centre[0] - head.centre[0], quad.centre[1] - head.centre[1]],
    z: quad.z - head.z,
  }
}
