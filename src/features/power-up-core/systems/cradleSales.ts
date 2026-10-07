/**
 * What the Upgrade bay sells of the cradles (ticket 248, kernel `vehicleItemSellers`): each at 20
 * band-5 ore units at its unlock planet through `bandOrePriceAt` (#162 4.1, the Systems note on
 * #200), the planet of the tree node that unlocks it. A cradle no registered node unlocks is not
 * on sale, so `slot.powerup_4` and `_5` wait for their nodes.
 *
 * Its card (#159, the K7 `itemDescriptionEntries` seam) says the slot it opens and its price.
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { ZERO_MONEY, type Money } from '../../../systems/money'
import type { ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type {
  VehicleItemOffer,
  VehicleItemSeller,
} from '../../../systems/registries/vehicleItemSales'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { unlockTierOfItem } from '../../tech-tree'
import { POWER_UP_CORE_ECONOMY } from './powerUpEconomy'
import { CRADLE_ROWS, cradleRowOf, type CradleRow } from './cradles'
import { POWER_UP_SLOTS } from './powerUpSlots'

export const CRADLE_SELLER: VehicleItemSeller = {
  id: 'power-up-core.seller',
  offerOf: (itemId) => cradleOfferOf(itemId),
}

export const CRADLE_CARDS: readonly ItemDescriptionEntry[] = CRADLE_ROWS.map(cardOf)

/** The cradle's price at its unlock planet; null while no registered node unlocks it. */
export function cradlePriceOf(itemId: string): Money | null {
  const planet = unlockTierOfItem(itemId)
  if (planet === null) return null
  return bandOrePriceAt(POWER_UP_CORE_ECONOMY.cradlePrice, planet, planet)
}

function cradleOfferOf(itemId: string): VehicleItemOffer | null {
  const row = cradleRowOf(itemId)
  const price = row === null ? null : cradlePriceOf(itemId)
  return row === null || price === null ? null : { name: row.name, price }
}

function cardOf(row: CradleRow): ItemDescriptionEntry {
  const slotsLine: DescribedStatLineSpec = {
    label: 'Power-up slots',
    kind: 'linearInt',
    value: () => slotCountOf(row),
    nextLevel: hasNoNextLevel,
  }
  const priceLine: DescribedStatLineSpec = {
    label: 'Price',
    kind: 'geometric',
    value: priceValueOf,
    nextLevel: hasNoNextLevel,
  }
  return {
    id: `power-up-core.${row.id}`,
    matches: { kind: 'vehicle-item', id: row.id },
    flavour: row.flavour,
    statLines: [slotsLine, priceLine],
  }
}

/** The power-up slots the vehicle has once this cradle is owned: its slot's number. */
function slotCountOf(row: CradleRow): number {
  return POWER_UP_SLOTS.indexOf(row.opens) + 1
}

/** Zero before the cradle has a node: no card shows a price nobody charges. */
function priceValueOf(ref: ItemRef): Money {
  return cradlePriceOf(ref.id) ?? ZERO_MONEY
}
