/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): each shipped
 * drill-gear item is a one-off at 15 band-5 units at its unlock planet (#162 4.1), the price its
 * card shows. The lane has no consumable; a held-back item would have no price, so it is not sold.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { drillGearItemOf, itemPriceOf } from './drillGearItems'

export const DRILL_GEAR_SELLER: VehicleItemSeller = {
  id: 'drill-gear.seller',
  offerOf: (itemId) => oneOffOfferOf(itemId),
}

function oneOffOfferOf(itemId: string): VehicleItemOffer | null {
  const item = drillGearItemOf(itemId)
  const price = item === null ? null : itemPriceOf(item)
  return item === null || price === null ? null : { name: item.name, price }
}
