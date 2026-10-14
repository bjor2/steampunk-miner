/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): the resonance
 * whistle at its one-off price, 15 band-5 units at its unlock planet (#162 4.1), the price its card
 * shows. It is answered before P15 too: the kernel refuses an unresearched item, and the entry node
 * opens only at P15 and the research lab.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { WHISTLE_ID, WHISTLE_NAME, whistlePrice } from './whistleItem'

export const AETHERIC_SELLER: VehicleItemSeller = {
  id: 'aetheric.seller',
  offerOf: (itemId) => whistleOfferOf(itemId),
}

function whistleOfferOf(itemId: string): VehicleItemOffer | null {
  return itemId === WHISTLE_ID ? { name: WHISTLE_NAME, price: whistlePrice() } : null
}
