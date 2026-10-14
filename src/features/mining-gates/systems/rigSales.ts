/**
 * What the Upgrade bay sells of the extractors (ticket 248, kernel `vehicleItemSellers`): each at
 * 40 band-5 ore of its own planet (#142 `availableFromPlanet`, its price anchor) through
 * `bandOrePriceAt` (`rigPriceOf`), so the card shows the number the store debits, and on sale on
 * every planet once the tree researched its node (Bjor's price-only ruling on #411). Bought, it is
 * owned (`ownsRig`) and always mounted; a gated cell still asks for its rig cell by cell. From its
 * own planet the offer is bought before the tracks (ticket 296): the pacing bot researches the
 * node and buys the extractor ahead of its track levels, saving for them, so it owns each within
 * the first 4 trips on its planet (#142 acceptance 7).
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
import { availableFromPlanet, rigNamed, rigPriceOf } from './rigs'

export const RIG_SELLER: VehicleItemSeller = {
  id: 'mining-gates.seller',
  offerOf: (itemId) => rigOfferOf(itemId),
}

export const RIG_CARDS: readonly ItemDescriptionEntry[] = GATE_ROWS.rigs.map(cardOf)

function rigOfferOf(itemId: string): VehicleItemOffer | null {
  const rig = rigNamed(itemId)
  if (rig === null) return null
  const boughtBeforeTracksFrom = availableFromPlanet(rig)
  return { name: rig.name, price: rigPriceOf(rig), boughtBeforeTracksFrom }
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
