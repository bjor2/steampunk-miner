/**
 * `power-up-core.restock_consumable {itemId}` (ticket 394, `consumableRestock.ts`): at the Upgrade
 * bay, fill the player's own stack of a restocked consumable to capacity at its Mark, paying each
 * missing charge at the unit price here. A buy the wallet cannot pay is refused, never trimmed
 * (#8), as the blasting charges' restock is.
 *
 * In order it is refused when no slice restocks the item (`not_restocked`), the vehicle is not
 * docked at the Upgrade bay, the player does not own the item (`not_owned`: there is no restock
 * and no preview before its node owns it), the stack is full (`stack_full`), or the wallet is
 * short. It debits the bill and answers `ConsumableRestocked`. A refused command changes nothing.
 */
import { withWallet, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  firstRejection,
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import { atBayRejection } from '../../../systems/authority/dockRules'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import { moneyShortRejection } from '../../../systems/authority/platformServices'
import { sub } from '../../../systems/money'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import {
  chargesLeftOf,
  itemChargesOf,
  powerUpStateOf,
  withItemCharges,
  withPowerUpState,
} from './chargeState'
import {
  restockBillOf,
  restockOfItem,
  type ConsumableRestock,
  type RestockBill,
} from './consumableRestock'
import { consumableRestockedOf } from './powerUpEvents'

export const RESTOCK_RULES: SliceCommandRules = {
  'power-up-core.restock_consumable': {
    fields: { itemId: 'text' },
    reject: (state, { playerId, payload }) => restockRefusalOf(state, playerId, payload.itemId),
    apply: (state, { playerId, payload }) =>
      restockConsumable(state, playerId, restockOfItem(payload.itemId) as ConsumableRestock),
  },
}

/** The intent the Upgrade bay's restock button sends. */
export function restockConsumableIntent(itemId: string) {
  return { type: 'power-up-core.restock_consumable' as const, payload: { itemId } }
}

/** Why restocking `itemId` would be refused now, in the order above; null when it would fill. */
export function restockRefusalOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): Rejection | null {
  const restock = restockOfItem(itemId)
  if (restock === null) return notRestockedRejection(itemId)
  const bill = restockBillOf(state, playerId, restock)
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => notOwnedRejection(state, playerId, itemId),
    () => fullStackRejection(bill, itemId),
    () => moneyShortRejection(state.players[playerId].wallet, bill.price),
  ])
}

function restockConsumable(
  state: AuthorityState,
  playerId: string,
  restock: ConsumableRestock,
): RuleEffect {
  const bill = restockBillOf(state, playerId, restock)
  const paid = withWallet(state, playerId, sub(state.players[playerId].wallet, bill.price))
  const filled = withStackFull(paid, playerId, restock.itemId)
  const chargesLeft = chargesLeftOf(filled, playerId, restock.itemId)
  return { state: filled, events: [consumableRestockedOf(playerId, restock, bill, chargesLeft)] }
}

/** None spent: the stack holds what the player's Mark gives it. */
function withStackFull(state: AuthorityState, playerId: string, itemId: string): AuthorityState {
  const value = powerUpStateOf(state, playerId)
  const charges = { ...itemChargesOf(value, itemId), spent: 0 }
  return withPowerUpState(state, playerId, withItemCharges(value, itemId, charges))
}

function notRestockedRejection(itemId: string): Rejection {
  return rejectionOf('power-up-core.not_restocked', `no slice restocks "${itemId}"`)
}

function notOwnedRejection(state: AuthorityState, playerId: string, itemId: string) {
  if (ownsItem(state, playerId, itemId)) return null
  return rejectionOf('power-up-core.not_owned', `"${itemId}" is not owned`)
}

function fullStackRejection(bill: RestockBill, itemId: string): Rejection | null {
  if (bill.count > 0) return null
  return rejectionOf('power-up-core.stack_full', `"${itemId}" has every charge`)
}
