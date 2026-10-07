/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): the echo
 * sounder and the three passives, each a one-off at 15 band-5 units at its unlock planet (#162
 * 4.1), the price its card shows. The flare mortar and the signal buoy are bought by the unit and
 * their stacks restocked, which is the restock's path, not a one-off buy; a held row is not sold.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import type { SensingItem } from './sensingCatalogue'
import { SHIPPED_SENSING_ITEMS } from './sensingContent'
import { itemPriceOf } from './sensingItems'

export const SENSING_SELLER: VehicleItemSeller = {
  id: 'sensing.seller',
  offerOf: (itemId) => oneOffOfferOf(itemId),
}

function oneOffOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_SENSING_ITEMS.find((candidate) => candidate.itemId === itemId)
  if (item === undefined || !isOneOff(item)) return null
  return { name: item.name, price: itemPriceOf(item, item.node.unlockTier) }
}

function isOneOff(item: SensingItem): boolean {
  return item.powerUpClass !== 'consumable'
}
