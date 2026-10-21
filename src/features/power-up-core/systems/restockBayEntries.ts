/**
 * The consumable restock at the Upgrade bay (ticket 394, through the kernel's bay entries, ticket
 * 344): one entry per restocked consumable the player owns, so nothing shows before research owns
 * it (the GD ruling on #381: no seller and no preview before then). Ownership is the restock's
 * only gate, but a bay entry source waits on a schedule row: it takes `core_harvest`, a planet-1
 * travel row open on every planet (the Upgrade bay's own `sell_upgrade_loop` is a facility row
 * travel never opens). Each entry reads the stack left at the player's Mark and the bill to fill
 * it; its button is the kernel's `commandButton` over `restock_consumable`, so the price shown is
 * the price debited and a full stack's refusal is the authority's. A full stack shows one charge's
 * price, the line it would cost next.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { Money } from '../../../systems/money'
import type { BayEntry, BayEntrySource } from '../../../systems/registries/bayEntries'
import { contentOf } from '../../../systems/registries/content'
import { vehicleItemRefOf } from '../../../systems/registries/kernelItems'
import { itemCardOf, SHOP_SOURCE } from '../../../systems/views/itemCardModel'
import { UI_ID_TEMPLATES } from '../../../systems/views/screenIds'
import { priceReading, commandButton } from '../../../systems/views/viewParts'
import { chargesLeftOf } from './chargeState'
import { restockBillOf, type ConsumableRestock, type RestockBill } from './consumableRestock'
import { powerUpAtMarkOf } from './powerUpMarks'
import { restockConsumableIntent } from './restockRules'

/** Open from planet 1 on: the restock waits on ownership alone. */
const EVERY_PLANET_ROW = 'core_harvest'

export const RESTOCK_BAY_ENTRIES: BayEntrySource = {
  id: 'power-up-core.restock-entries',
  bay: 'upgrade',
  anchorFeatureId: EVERY_PLANET_ROW,
  entriesOf: restockEntriesOf,
}

/** One entry per restocked consumable the player owns, in entry id order. */
export function restockEntriesOf(state: AuthorityState, playerId: string): BayEntry[] {
  return contentOf('consumable-restock')
    .filter((restock) => ownsItem(state, playerId, restock.itemId))
    .map((restock) => restockEntryOf(state, playerId, restock))
}

/** `restock-<itemId>`: the screen ids are `upgradebay-entry-restock-<itemId>` and its `-buy`. */
export function restockEntryIdOf(itemId: string): string {
  return `restock-${itemId}`
}

function restockEntryOf(
  state: AuthorityState,
  playerId: string,
  restock: ConsumableRestock,
): BayEntry {
  const entryId = restockEntryIdOf(restock.itemId)
  const bill = restockBillOf(state, playerId, restock)
  const intent = restockConsumableIntent(restock.itemId)
  const buyId = UI_ID_TEMPLATES.upgradebayEntryBuy(entryId)
  const buy = commandButton(state, playerId, buyId, 'Restock', intent)
  const cost = priceReading(shownPriceOf(bill))
  return {
    entryId,
    iconId: restock.iconId,
    label: restock.name,
    levelText: stackTextOf(state, playerId, restock.itemId),
    cost,
    effectText: fillTextOf(bill),
    buy,
    card: itemCardOf(state, playerId, {
      item: vehicleItemRefOf(restock.itemId),
      iconId: restock.iconId,
      name: restock.name,
      cost,
      level: powerUpAtMarkOf(state, playerId, restock.itemId)?.mark ?? 0,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}

/** The fill's price, or one charge's when the stack is full. */
function shownPriceOf(bill: RestockBill): Money {
  return bill.count > 0 ? bill.price : bill.unitPrice
}

/** `2/4`: the charges left of the stack at the player's Mark. */
function stackTextOf(state: AuthorityState, playerId: string, itemId: string): string {
  const stack = powerUpAtMarkOf(state, playerId, itemId)?.charges ?? 0
  return `${chargesLeftOf(state, playerId, itemId)}/${stack}`
}

function fillTextOf(bill: RestockBill): string {
  if (bill.count === 0) return 'Full'
  return bill.count === 1 ? '+1 charge' : `+${bill.count} charges`
}
