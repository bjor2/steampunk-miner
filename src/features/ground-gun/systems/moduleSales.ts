/**
 * What the Upgrade bay sells of the armoury lanes (ticket 248's `vehicleItemSellers`, tickets 318
 * and 388): each shipped module of the `bore_gun` and `auto_guns` lanes once researched, a one-off
 * at its unlock planet's price (#162 4.1), the price its card shows. A held-back module has no
 * seller, so nothing offers it.
 */
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { autoGunsModuleOf, autoGunsModulePriceOf } from './autoGunsLane'
import { boreGunModuleOf, modulePriceOf } from './boreGunLane'

export const BORE_GUN_MODULE_SELLER: VehicleItemSeller = {
  id: 'ground-gun.module-seller',
  offerOf: (itemId) => boreModuleOfferOf(itemId) ?? turretModuleOfferOf(itemId),
}

function boreModuleOfferOf(itemId: string): VehicleItemOffer | null {
  const module = boreGunModuleOf(itemId)
  return module === null ? null : { name: module.name, price: modulePriceOf(module) }
}

function turretModuleOfferOf(itemId: string): VehicleItemOffer | null {
  const module = autoGunsModuleOf(itemId)
  return module === null ? null : { name: module.name, price: autoGunsModulePriceOf(module) }
}
