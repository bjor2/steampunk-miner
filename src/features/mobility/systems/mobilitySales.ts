/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): each one-off
 * item at 15 band-5 units at its unlock planet (#162 4.1), the price its card shows. A consumable
 * is bought by the unit and its stack restocked, which is the restock's path, not a one-off buy;
 * the third cradle is `power-up-core`'s to sell.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { markLadderOf } from './markLadders'
import { mobilityRowOf } from './mobilityCatalogue'
import { isConsumableItem, oneOffPriceOf } from './statPreview'

export const MOBILITY_SELLER: VehicleItemSeller = {
  id: 'mobility.seller',
  offerOf: (itemId) => oneOffOfferOf(itemId),
}

function oneOffOfferOf(itemId: string): VehicleItemOffer | null {
  const row = mobilityRowOf(itemId)
  if (row === null || !isOneOff(itemId)) return null
  return { name: row.name, price: oneOffPriceOf(row) }
}

/** A lane item with a Mark ladder (not the cradle) that is not a consumable. */
function isOneOff(itemId: string): boolean {
  return markLadderOf(itemId) !== null && !isConsumableItem(itemId)
}
