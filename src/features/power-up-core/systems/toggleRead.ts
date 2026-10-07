/**
 * Whether a toggle is working for a player: switched on and still in a slot (ticket 234). Another
 * slice's toggle effect answers to this read, such as #205's side cutters on the kernel's
 * drill-gear read; the energy it draws meanwhile is `power-up-core.draw-toggles`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { slotHoldingItem } from '../../../systems/vehicle/loadoutState'
import { isToggledOn, powerUpStateOf } from './chargeState'

export function isToggleEngaged(state: AuthorityState, playerId: string, itemId: string): boolean {
  const isOn = isToggledOn(powerUpStateOf(state, playerId), itemId)
  return isOn && slotHoldingItem(vehicleOf(state, playerId).loadout, itemId) !== null
}
