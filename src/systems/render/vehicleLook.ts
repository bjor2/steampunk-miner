/**
 * The run vehicle's look, read from the `vehicle` asset (#52, #51): the S7a parts cut from its
 * atlas (or, while the asset is a placeholder, its flat-coloured quads) at the authority's visual
 * tier (#7: tier 2 adds side armour and a second stack, tier 3 a bore-collar drill, a second
 * boiler and a second lamp). The drill head and bit ride the swivelling head (#7: it turns to 4
 * facings), so they are drawn around the head's pivot; every other part is drawn on the body. The
 * art may overhang the 0.9 m collider but never sizes it (#7): physics reads
 * `VEHICLE_COLLIDER_SIZE`, never this file. Parts a slice swaps in (#180, `partMotionRequests`)
 * take their slots whatever the tier; another asset's look parts (ticket 640) hide the slots they
 * stand in and are drawn beside these quads (`lookPartQuads`).
 */
import type { ArtCatalogue } from '../art/artCatalogue'
import { slotOfPartId } from '../art/artIds'
import { assetQuadsOf, atlasMapsOf, type AssetQuad, type AtlasMaps } from '../art/assetLook'
import { NO_SWAPS } from '../art/placeholderLook'
import type { PartSwapRequest } from '../registries/partMotionRequests'
import { hiddenSlotsOf, lookHeadQuadsOf, NO_LOOK_SWAPS, type LookPartQuad } from './lookPartQuads'
import { createPartPose, writePartPose, type PartMotion, type PartPose } from './partMotion'

export const VEHICLE_ASSET_ID = 'vehicle'

const DRILL_HEAD_SLOT = 'drill-head'

/** The parts the drill head carries: the head plate and the bit. */
function isOnDrillHead(quad: AssetQuad): boolean {
  return slotOfPartId(quad.partId).startsWith('drill-')
}

/** Every part id the run vehicle shows at a visual tier (the debug API's `vehicleParts`). */
export function vehiclePartIdsOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[] = NO_SWAPS,
  looks: readonly PartSwapRequest[] = NO_LOOK_SWAPS,
): string[] {
  return shownVehicleQuadsOf(art, visualTier, swappedPartIds, looks).map((quad) => quad.partId)
}

/** The maps the vehicle's parts are cut from, or null while it is a placeholder. */
export function vehicleAtlasMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, VEHICLE_ASSET_ID)
}

/**
 * Every part's pose now, by part id (#48 acceptance 1-2: the render view model a scripted drive
 * reads): the same rule the drawn parts follow, with each part's half-height as its radius.
 */
export function vehiclePartPosesOf(
  art: ArtCatalogue,
  motion: PartMotion,
  visualTier: number,
  isMotionReduced: boolean,
): Record<string, PartPose> {
  const poses: Record<string, PartPose> = {}
  const { shownPartIds, shownLooks } = motion.requested
  for (const quad of shownVehicleQuadsOf(art, visualTier, shownPartIds, shownLooks)) {
    const pose = createPartPose()
    writePartPose(motion, slotOfPartId(quad.partId), quad.size[1] / 2, isMotionReduced, pose)
    poses[quad.partId] = pose
  }
  return poses
}

/** The quads drawn on the body, lowest draw order first. */
export function vehicleBodyQuadsOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[] = NO_SWAPS,
  looks: readonly PartSwapRequest[] = NO_LOOK_SWAPS,
): AssetQuad[] {
  return shownVehicleQuadsOf(art, visualTier, swappedPartIds, looks).filter(
    (quad) => !isOnDrillHead(quad),
  )
}

/**
 * The quads the drill head carries, centred on the head plate's centre and with `z` counted from
 * the plate's, so the swivel can place and turn them as one.
 */
export function drillHeadQuadsOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[] = NO_SWAPS,
  looks: readonly PartSwapRequest[] = NO_LOOK_SWAPS,
): AssetQuad[] {
  const head = headPlateOf(art, visualTier, swappedPartIds)
  if (head === undefined) return []
  return shownVehicleQuadsOf(art, visualTier, swappedPartIds, looks)
    .filter(isOnDrillHead)
    .map((quad) => relativeToHead(quad, head))
}

/** The look parts the drill head carries, placed like `drillHeadQuadsOf`'s. */
export function drillHeadLookQuadsOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[],
  looks: readonly PartSwapRequest[],
): LookPartQuad[] {
  const head = headPlateOf(art, visualTier, swappedPartIds)
  if (head === undefined) return []
  return lookHeadQuadsOf(art, looks).map((look) => ({
    ...look,
    quad: relativeToHead(look.quad, head),
  }))
}

/** The head plate's width, which sets how far ahead of the collider the head reaches. */
export function drillHeadSizeOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[] = NO_SWAPS,
): number {
  const head = drillHeadQuadsOf(art, visualTier, swappedPartIds).find((quad) => quad.z === 0)
  return head === undefined ? 0 : head.size[0]
}

/** The tier's quads with the swaps in and the slots a look stands in left out. */
function shownVehicleQuadsOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[],
  looks: readonly PartSwapRequest[],
): AssetQuad[] {
  const quads = assetQuadsOf(art, VEHICLE_ASSET_ID, visualTier, swappedPartIds)
  if (looks.length === 0) return quads
  const hidden = hiddenSlotsOf(art, looks)
  return quads.filter((quad) => !hidden.includes(slotOfPartId(quad.partId)))
}

function headPlateOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[],
): AssetQuad | undefined {
  return assetQuadsOf(art, VEHICLE_ASSET_ID, visualTier, swappedPartIds).find(
    (quad) => slotOfPartId(quad.partId) === DRILL_HEAD_SLOT,
  )
}

function relativeToHead(quad: AssetQuad, head: AssetQuad): AssetQuad {
  return {
    ...quad,
    centre: [quad.centre[0] - head.centre[0], quad.centre[1] - head.centre[1]],
    pivot: [quad.pivot[0] - head.centre[0], quad.pivot[1] - head.centre[1]],
    z: quad.z - head.z,
  }
}
