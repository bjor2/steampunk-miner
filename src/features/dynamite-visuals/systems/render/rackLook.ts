/**
 * The dynamite rack at `hull.rear` (#153 "every size unlock is a visible new stick model in the
 * rack", recast by the GD lock of 25 Oct on #647 as "a rack socket with a slot per type and stock
 * pips", D7 ticket 866; took over from the kernel's charge rack in #215): once the rack is bolted
 * on, its frame, a bay's bundle for every charge type with a size open on the planet, and under
 * each bay one lit pip per charge of that type carried, up to the rack's full eight; the plunger's
 * wire reel and plunger box from the remote detonator's unlock (#153 amendment 2); the casing
 * nozzle once the Blast Casing node is owned (#862). The bundles grow with the Blast Radius band
 * (#869), scaled about their pivot, so a bigger radius shows on the rig before the next blast.
 */
import { isSizeLockedOn } from '../../../../systems/economy/chargeSizes'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { atlasMapsOf, type AssetQuad, type AtlasMaps } from '../../../../systems/art/assetLook'
import type { Pair } from '../../../../systems/art/partsSidecar'
import { attachOf, isAttachId, type AttachUse } from '../../../../systems/registries/vehicleAttach'
import { mountedPartQuadsOf, type PartMount } from '../../../../systems/render/mountedPartLook'
import { chargeTypeOf } from '../../../../systems/economy/chargeSizes'
import type { CarriedBySize } from '../../../../systems/vehicle/vehicleCharges'
import { chargeTypes, DYNAMITE_LOOKS, radiusGrowthOf } from './chargeTypeLook'
import {
  DYNAMITE_RACK_ASSET_ID,
  dynamiteSizes,
  pipPartIdOf,
  pipsPerType,
  PLUNGER_PART_ID,
  RACK_FRAME_PART_ID,
  slotPartIdOf,
  WIRE_REEL_PART_ID,
} from './dynamiteArt'

/**
 * The rack rides the `blasting_charges` row's point (the Workshop's reaction for that row sits
 * there too, #180), registered through the K5 attach registry rather than named in the scene.
 */
export const RACK_ITEM_ID = 'blasting_charges'

export const RACK_ATTACH_USE: AttachUse = {
  id: 'dynamite-visuals.rack',
  itemId: RACK_ITEM_ID,
  attach: 'hull.rear',
}

/** What the rack shows from: the local vehicle's rack and stock, the planet and the two nodes. */
export interface RackSight {
  isRackMounted: boolean
  planetIndex: number
  isDetonatorOpen: boolean
  carriedBySize: CarriedBySize
  /** The owned Blast Radius level (#869); 0 until the line is bought. */
  radiusLevel: number
  /** Whether the Blast Casing node is owned (#862). */
  isBlastCasingOwned: boolean
}

/** The part ids the rack shows, frame first; none until it is bolted on. */
export function rackPartIdsOf(sight: RackSight): string[] {
  if (!sight.isRackMounted) return []
  return [
    RACK_FRAME_PART_ID,
    ...openTypesOn(sight.planetIndex).flatMap((type) => bayPartIdsOf(type, sight.carriedBySize)),
    ...detonatorPartIdsOf(sight),
    ...nozzlePartIdsOf(sight),
  ]
}

/** The charges of `type` in the rack, over every size of the type. */
export function stockOfType(carriedBySize: CarriedBySize, type: number): number {
  return Object.entries(carriedBySize).reduce(
    (stock, [size, count]) =>
      stock + (chargeTypeOf(Number.parseInt(size, 10)) === type ? count : 0),
    0,
  )
}

/** The rack at the point its attach use registers; null while none places it. */
export function rackMountOf(): PartMount | null {
  const attachId = attachOf(RACK_ITEM_ID)
  if (attachId === null || !isAttachId(attachId)) return null
  return { assetId: DYNAMITE_RACK_ASSET_ID, attachId }
}

/**
 * The shown parts in the vehicle's frame at the rack's point, the bays' bundles grown for the
 * Blast Radius level about their pivots.
 */
export function rackQuadsOf(
  art: ArtCatalogue,
  mount: PartMount,
  shownPartIds: readonly string[],
  radiusLevel: number,
): AssetQuad[] {
  const growth = radiusGrowthOf(radiusLevel)
  return mountedPartQuadsOf(art, mount)
    .filter((quad) => shownPartIds.includes(quad.partId))
    .map((quad) => (isSlotPart(quad.partId) ? grownAboutPivot(quad, growth) : quad))
}

export function rackMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, DYNAMITE_RACK_ASSET_ID)
}

/** The types with a size open on the planet; type 1's size 1 is never locked. */
function openTypesOn(planetIndex: number): number[] {
  const openTypes = new Set(
    dynamiteSizes()
      .filter((size) => !isSizeLockedOn(size, planetIndex))
      .map(chargeTypeOf),
  )
  return chargeTypes().filter((type) => openTypes.has(type))
}

function bayPartIdsOf(type: number, carriedBySize: CarriedBySize): string[] {
  const lit = Math.min(stockOfType(carriedBySize, type), pipsPerType())
  const pips = Array.from({ length: lit }, (_, at) => pipPartIdOf(type, at + 1))
  return [slotPartIdOf(type), ...pips]
}

function detonatorPartIdsOf(sight: RackSight): string[] {
  return sight.isDetonatorOpen ? [WIRE_REEL_PART_ID, PLUNGER_PART_ID] : []
}

function nozzlePartIdsOf(sight: RackSight): string[] {
  return sight.isBlastCasingOwned ? [DYNAMITE_LOOKS.casing.nozzlePart] : []
}

function isSlotPart(partId: string): boolean {
  return chargeTypes().some((type) => slotPartIdOf(type) === partId)
}

function grownAboutPivot(quad: AssetQuad, growth: number): AssetQuad {
  return {
    ...quad,
    size: [quad.size[0] * growth, quad.size[1] * growth],
    centre: awayFrom(quad.pivot, quad.centre, growth),
  }
}

function awayFrom([px, py]: Pair, [cx, cy]: Pair, growth: number): Pair {
  return [px + (cx - px) * growth, py + (cy - py) * growth]
}
