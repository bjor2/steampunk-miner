/**
 * What the Upgrade bay sells of the combos (ticket 248's `vehicleItemSellers`; GD lock on #206,
 * decision 7): grade 1 of each shipped combo, the one-off buy, at 15 band-5 units priced at the
 * planet it unlocks on (#162 4.1): its authored node's tier, or its first generated grade's for an
 * endless-only combo. Every later grade is research only, so nothing more is sold.
 */
import type { Money } from '../../../systems/money'
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { unlockTierOfItem } from '../../tech-tree'
import { SHIPPED_COMBOS } from './comboContent'
import { comboPriceAt } from './comboRows'

export const COMBO_SELLER: VehicleItemSeller = {
  id: 'combos.seller',
  offerOf: (itemId) => comboOfferOf(itemId),
}

function comboOfferOf(itemId: string): VehicleItemOffer | null {
  const item = SHIPPED_COMBOS.find((shipped) => shipped.itemId === itemId)
  const price = item === undefined ? null : comboPriceOf(itemId)
  return item === undefined || price === null ? null : { name: item.name, price }
}

/** The one-off price at the combo's unlock planet; null while no registered node unlocks it. */
export function comboPriceOf(itemId: string): Money | null {
  const unlockPlanet = unlockTierOfItem(itemId)
  return unlockPlanet === null ? null : comboPriceAt(unlockPlanet)
}
