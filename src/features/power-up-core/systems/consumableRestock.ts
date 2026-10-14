/**
 * The consumable restock (ticket 394, X2 of the #157 gap review; the GD ruling on #381, option c,
 * with the HS and VS conditions): a consumable's stack is never refilled free at the dock (#200
 * Q3) and never sold whole (#248), so it is bought back by the charge. An item slice opts its
 * consumable in with a `consumable-restock` entry naming the item and one charge's price in band
 * ore; the core prices and fills it, so a later consumable registers data and no kernel code.
 *
 * Restocking fills the player's own stack to capacity at their Mark (#162 4.3), each charge at the
 * entry's band-ore price on the planet it is restocked on (#162 4.1: the current planet). The
 * price is economic only: no planet cap trims it. Charges live in the player's own `power-up-core`
 * section and the player pays from their own wallet, so nothing is pooled between players.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import { fromSafeInteger, mul, type Money } from '../../../systems/money'
import { contentOf, type ContentEntry } from '../../../systems/registries/content'
import { chargesLeftIn, powerUpStateOf } from './chargeState'
import { hasCharges } from './powerUpKind'
import { powerUpAtMarkOf } from './powerUpMarks'

export interface ConsumableRestock extends ContentEntry {
  /** `<slice>.<name>`: the registering slice's id for this entry. */
  id: string
  /** The bare catalogue id of the consumable it restocks, as its `power-up` entry names it. */
  itemId: string
  /** The item's player-facing name, for its row at the Upgrade bay. */
  name: string
  /** One charge: `oreUnits` of ore of `band`, valued on the planet it is restocked on. */
  unitPrice: BandOreCost
}

declare module '../../../systems/registries/content' {
  interface ContentKinds {
    'consumable-restock': ConsumableRestock
  }
}

/** What filling a stack costs: the charges missing at the player's Mark, all at one unit price. */
export interface RestockBill {
  count: number
  unitPrice: Money
  price: Money
}

/** The restock registered for the item; null for one no slice restocks. */
export function restockOfItem(itemId: string): ConsumableRestock | null {
  return contentOf('consumable-restock').find((restock) => restock.itemId === itemId) ?? null
}

/** One charge's price on `planetIndex`: the entry's band ore worth there, rounded up once. */
export function restockUnitPriceAt(restock: ConsumableRestock, planetIndex: number): Money {
  return bandOrePriceAt(restock.unitPrice, planetIndex, planetIndex)
}

/** The bill for filling the player's stack here and now. */
export function restockBillOf(
  state: AuthorityState,
  playerId: string,
  restock: ConsumableRestock,
): RestockBill {
  const count = missingChargesOf(state, playerId, restock.itemId)
  const unitPrice = restockUnitPriceAt(restock, state.planet.index)
  return { count, unitPrice, price: mul(unitPrice, fromSafeInteger(count)) }
}

/** The stack at the player's Mark less the charges left; 0 for an item that counts none. */
function missingChargesOf(state: AuthorityState, playerId: string, itemId: string): number {
  const powerUp = powerUpAtMarkOf(state, playerId, itemId)
  if (powerUp === null || !hasCharges(powerUp)) return 0
  return powerUp.charges - chargesLeftIn(powerUpStateOf(state, playerId), powerUp)
}
