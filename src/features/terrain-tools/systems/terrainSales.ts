/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): the
 * ore-shifter and the pressure pocket lance, each a one-off at 15 band-5 units at its unlock planet
 * (#162 4.1), the price its card shows. The seam splitter and the lodestone beacon are bought by the
 * unit and their stacks restocked, which is the restock's path, not a one-off buy; a held row is
 * not sold. A shipped terrain magnet is a one-off at the same price, read at its node's planet
 * (ticket 284). Neither waits on a planet: the price is the only gate (#411).
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
  offerOf: (itemId) => oneOffOfferOf(itemId) ?? magnetOfferOf(itemId),
}

function oneOffOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_TERRAIN_ITEMS.find((candidate) => candidate.itemId === itemId)
  if (item === undefined || isConsumable(item)) return null
  return { name: item.name, price: itemPriceOf(item, item.node.unlockTier) }
}

/**
 * A shipped magnet. The GD lock on #246 kept it off sale before its node's planet; #411 makes its
 * price the only gate, and the store still sells it only once its node is researched.
 */
function magnetOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_MAGNET_ITEMS.find((candidate) => candidate.itemId === itemId)
  if (item === undefined) return null
  return { name: item.name, price: magnetPriceOf(item) }
}
