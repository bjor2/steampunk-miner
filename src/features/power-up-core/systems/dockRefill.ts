/**
 * Charges snap back at the dock (#162 section 2.1, Systems on #200): a free side-effect of the paid
 * recharge (`dockServices`, #217), with no line on the bill. Each refilled item logs its charges
 * after (`charges_refilled {itemId, to}`), so the spend-share read can tell a free refill from a
 * paid buy. Consumable stacks are bought, so the free refill leaves them as they are.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DockService } from '../../../systems/registries/dockServices'
import {
  itemChargesOf,
  powerUpStateOf,
  withItemCharges,
  withPowerUpState,
  type PowerUpState,
} from './chargeState'
import { chargesRefilledOf } from './powerUpEvents'
import { isRefilledAtDock, powerUpOfItem, type PowerUp } from './powerUpKind'

export const REFILL_CHARGES_SERVICE: DockService = {
  id: 'power-up-core.refill-charges',
  onRecharge: refillChargesAtDock,
}

function refillChargesAtDock(state: AuthorityState, playerId: string): RuleEffect {
  const value = powerUpStateOf(state, playerId)
  const refilled = spentRefillablesOf(value)
  if (refilled.length === 0) return unchanged(state)
  return {
    state: withPowerUpState(state, playerId, refilledAll(value, refilled)),
    events: refilled.map((powerUp) => chargesRefilledOf(playerId, powerUp.itemId, powerUp.charges)),
  }
}

/** The charged items with a charge spent, in item order. */
function spentRefillablesOf(value: PowerUpState): PowerUp[] {
  return Object.keys(value.items)
    .filter((itemId) => itemChargesOf(value, itemId).spent > 0)
    .map(powerUpOfItem)
    .filter((powerUp): powerUp is PowerUp => powerUp !== null && isRefilledAtDock(powerUp))
}

function refilledAll(value: PowerUpState, refilled: readonly PowerUp[]): PowerUpState {
  return refilled.reduce(
    (current, { itemId }) =>
      withItemCharges(current, itemId, { ...itemChargesOf(current, itemId), spent: 0 }),
    value,
  )
}
