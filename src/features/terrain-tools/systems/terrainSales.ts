/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): the
 * ore-shifter and the pressure pocket lance, each a one-off at 15 band-5 units at its unlock planet
 * (#162 4.1), the price its card shows. The seam splitter and the lodestone beacon are bought by the
 * unit and their stacks restocked, which is the restock's path, not a one-off buy; a held row is
 * not sold.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { isConsumable, itemPriceOf } from './terrainItems'

export const TERRAIN_SELLER: VehicleItemSeller = {
  id: 'terrain-tools.seller',
  offerOf: (itemId) => oneOffOfferOf(itemId),
}

function oneOffOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_TERRAIN_ITEMS.find((candidate) => candidate.itemId === itemId)
  if (item === undefined || isConsumable(item)) return null
  return { name: item.name, price: itemPriceOf(item, item.node.unlockTier) }
}
