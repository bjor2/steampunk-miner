/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): the
 * ore-shifter and the pressure pocket lance, each a one-off at 15 band-5 units at its unlock planet
 * (#162 4.1), the price its card shows. The seam splitter and the lodestone beacon are bought by the
 * unit and their stacks restocked, which is the restock's path, not a one-off buy; a held row is
 * not sold. A shipped terrain magnet is a one-off at the same price from its unlock planet (ticket
 * 284).
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { magnetPriceOf } from './magnetItems'
import { SHIPPED_MAGNET_ITEMS, SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { isConsumable, itemPriceOf } from './terrainItems'

export const TERRAIN_SELLER: VehicleItemSeller = {
  id: 'terrain-tools.seller',
  offerOf: (itemId, planetIndex) => oneOffOfferOf(itemId) ?? magnetOfferOf(itemId, planetIndex),
}

function oneOffOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_TERRAIN_ITEMS.find((candidate) => candidate.itemId === itemId)
  if (item === undefined || isConsumable(item)) return null
  return { name: item.name, price: itemPriceOf(item, item.node.unlockTier) }
}

/** A magnet is on sale from its node's planet, never as a tease before it (GD lock on #246). */
function magnetOfferOf(itemId: string, planetIndex: number): VehicleItemOffer | null {
  const item = SHIPPED_MAGNET_ITEMS.find((candidate) => candidate.itemId === itemId)
  if (item === undefined || planetIndex < item.node.unlockTier) return null
  return { name: item.name, price: magnetPriceOf(item) }
}
