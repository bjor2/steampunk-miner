/**
 * What the Upgrade bay sells of the `bore_gun` lane (ticket 248's `vehicleItemSellers`, ticket
 * 318): each shipped module once researched, a one-off at its unlock planet's price (#162 4.1),
 * the price its card shows. A held-back module has no seller, so nothing offers it.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { boreGunModuleOf, modulePriceOf } from './boreGunLane'

export const BORE_GUN_MODULE_SELLER: VehicleItemSeller = {
  id: 'ground-gun.module-seller',
  offerOf: (itemId) => moduleOfferOf(itemId),
}

function moduleOfferOf(itemId: string): VehicleItemOffer | null {
  const module = boreGunModuleOf(itemId)
  return module === null ? null : { name: module.name, price: modulePriceOf(module) }
}
