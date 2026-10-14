/**
 * What the Upgrade bay sells of this lane (ticket 248, kernel `vehicleItemSellers`): each shipped
 * item at its one-off price, 15 band-5 units at its unlock planet (#162 4.1), the price its card
 * shows: the resonance whistle (#262), the phase lantern and the galvanic arc coil (#261), the
 * chronometric governor and the aether condenser (#263). An item is answered before its planet
 * too: the kernel refuses an unresearched item, and its node opens only at its planet (the entry
 * node also at the research lab); a fork branch's item is unlocked only while its branch is the
 * lane's active one (ticket 259), so the inactive branch's item is never sold.
 */
import type { Money } from '../../../systems/money'
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { ARC_COIL_ID, ARC_COIL_NAME, arcCoilPrice } from './arcCoilItem'
import { CONDENSER_ID, CONDENSER_NAME, condenserPrice } from './condenserItem'
import { GOVERNOR_ID, GOVERNOR_NAME, governorPrice } from './governorItem'
import { LANTERN_ID, LANTERN_NAME, lanternPrice } from './lanternItem'
import { WHISTLE_ID, WHISTLE_NAME, whistlePrice } from './whistleItem'

interface SoldItem {
  name: string
  price: () => Money
}

const SOLD_ITEMS: Readonly<Record<string, SoldItem>> = {
  [WHISTLE_ID]: { name: WHISTLE_NAME, price: whistlePrice },
  [LANTERN_ID]: { name: LANTERN_NAME, price: lanternPrice },
  [ARC_COIL_ID]: { name: ARC_COIL_NAME, price: arcCoilPrice },
  [GOVERNOR_ID]: { name: GOVERNOR_NAME, price: governorPrice },
  [CONDENSER_ID]: { name: CONDENSER_NAME, price: condenserPrice },
}

export const AETHERIC_SELLER: VehicleItemSeller = {
  id: 'aetheric.seller',
  offerOf: (itemId) => offerOf(itemId),
}

function offerOf(itemId: string): VehicleItemOffer | null {
  const sold = SOLD_ITEMS[itemId]
  return sold === undefined ? null : { name: sold.name, price: sold.price() }
}
