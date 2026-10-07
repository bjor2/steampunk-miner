/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): each shipped
 * income item at its one-off price, 15 band-5 units at its unlock planet (#162 4.1), the price its
 * card shows. The held slurry siphon is not sold.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { itemPriceOf } from './extractionItems'
import { SHIPPED_ITEMS } from './extractionContent'

export const EXTRACTION_SELLER: VehicleItemSeller = {
  id: 'extraction.seller',
  offerOf: (itemId) => shippedOfferOf(itemId),
}

function shippedOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_ITEMS.find((shipped) => shipped.itemId === itemId)
  if (item === undefined) return null
  return { name: item.name, price: itemPriceOf(item) }
}
