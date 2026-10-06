/**
 * The two shop buildings of #170 (art #174): the tall "Assay & Exchange" over the Sell zone and
 * the wide "Engineering Works" over the Workshop zone. Their art ids take the #52 form
 * `platform-building-<bay>`, derived from the slice bays as the bay art is; the Refinery keeps
 * `platform-bay-refinery` until its art moves behind the yard (#170 TD decision).
 *
 * Each building is one static shell baked into one part plus the parts that move (#170 budget:
 * "only the ticker, gantry and turntable move"), and carries the attach points the sell burst
 * (#171), the workshop showcase (#180) and the dock camera read, as `attach.<id>` empties in the
 * `.blend` exported into the sidecar's `attach` array (#162 K5 shape). #175 registers the ids in
 * the kernel `building-attach` registry; this module is the art's own list of them.
 */
import { SLICE_BAY_IDS, type BayId } from '../world/dockBays'

export type ShopBuildingBayId = Extract<BayId, 'sell' | 'upgrade'>

/** The bays that are buildings: Sell and Workshop (`upgrade`), never the Refinery. */
export const SHOP_BUILDING_BAY_IDS: readonly ShopBuildingBayId[] =
  SLICE_BAY_IDS.filter(isShopBuildingBay)

function isShopBuildingBay(bay: BayId): bay is ShopBuildingBayId {
  return bay === 'sell' || bay === 'upgrade'
}

/** The Game Director's seven attach points (#170 "Look"), each on the building it names. */
export const SHOP_BUILDING_ATTACH_IDS: Readonly<Record<ShopBuildingBayId, readonly string[]>> = {
  sell: ['sell.chute', 'sell.ticker', 'sell.stack'],
  upgrade: ['workshop.gantry', 'workshop.platform', 'workshop.stack', 'workshop.showcase_cam'],
}

/** The parts drawn over each shell that the code animates: the ticker; the gantry and turntable. */
const SHOP_BUILDING_MOVING_PARTS: Readonly<Record<ShopBuildingBayId, readonly string[]>> = {
  sell: ['sell-ticker'],
  upgrade: ['workshop-gantry', 'workshop-turntable'],
}

export function shopBuildingAssetIdOf(bay: ShopBuildingBayId): string {
  return `platform-building-${bay}`
}

export function shopBuildingAssetIds(): string[] {
  return SHOP_BUILDING_BAY_IDS.map(shopBuildingAssetIdOf)
}

/** The shell carries the asset's own id, as every single-part platform asset does. */
export function shopBuildingShellPartIdOf(bay: ShopBuildingBayId): string {
  return shopBuildingAssetIdOf(bay)
}

export function shopBuildingMovingPartIdsOf(bay: ShopBuildingBayId): readonly string[] {
  return SHOP_BUILDING_MOVING_PARTS[bay]
}

/** Every moving part of both buildings, for the registry of part ids outside the vehicle. */
export function shopBuildingMovingPartIds(): string[] {
  return SHOP_BUILDING_BAY_IDS.flatMap(shopBuildingMovingPartIdsOf)
}
