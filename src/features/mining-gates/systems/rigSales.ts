/**
 * What the Upgrade bay sells of the extractors (ticket 248, kernel `vehicleItemSellers`): each from
 * its own planet on (#142 `availableFromPlanet`), at 40 band-5 ore at that planet through
 * `bandOrePriceAt` (`rigPriceOf`), so the card shows the number the store debits. Bought, it is
 * owned (`ownsRig`) and always mounted. The store still sells it only once the tree researched its
 * node.
 *
 * Its card (#159, the K7 `itemDescriptionEntries` seam): #162's flavour line and the price.
 */
import { ZERO_MONEY, type Money } from '../../../systems/money'
import type { ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { GATE_ROWS, type Rig } from './gateRows'
import { isRigAvailableOn, rigNamed, rigPriceOf } from './rigs'

export const RIG_SELLER: VehicleItemSeller = {
  id: 'mining-gates.seller',
  offerOf: (itemId, planetIndex) => rigOfferOf(itemId, planetIndex),
}

export const RIG_CARDS: readonly ItemDescriptionEntry[] = GATE_ROWS.rigs.map(cardOf)

function rigOfferOf(itemId: string, planetIndex: number): VehicleItemOffer | null {
  const rig = rigNamed(itemId)
  if (rig === null || !isRigAvailableOn(rig, planetIndex)) return null
  return { name: rig.name, price: rigPriceOf(rig) }
}

function cardOf(rig: Rig): ItemDescriptionEntry {
  const priceLine: DescribedStatLineSpec = {
    label: 'Price',
    kind: 'geometric',
    value: priceValueOf,
    nextLevel: hasNoNextLevel,
  }
  return {
    id: `mining-gates.${rig.id}`,
    matches: { kind: 'vehicle-item', id: rig.id },
    flavour: rig.description,
    statLines: [priceLine],
  }
}

function priceValueOf(ref: ItemRef): Money {
  const rig = rigNamed(ref.id)
  return rig === null ? ZERO_MONEY : rigPriceOf(rig)
}
