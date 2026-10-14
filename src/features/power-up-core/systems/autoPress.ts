/**
 * A self-acting item pressed by the kernel's auto mode (ticket 328, the GD lock on #206 decision 6:
 * the alarm shield, later spotter guns). The auto core (`authority/autoMode/`) holds and previews;
 * its act comes here and takes the press path a key takes, so it is refused for the same reasons
 * (nothing spent), reserves its own charge, winds up, and starts the item's own cooldown on its
 * act. An auto press is always a plain use, never a milestone's follow-up.
 *
 * - **Ready.** The item may act again once no use of the player's is winding up or channelling (one
 *   at a time) and its cooldown has run out; a use by hand folds auto's wait into that cooldown
 *   (`manualWait.ts`).
 * - **A manual press wins** (#317's rule): a press by hand drops the locked preview, since its use
 *   pending holds auto `recovering`. A press by hand of the same slot in the very tick auto pressed
 *   it takes its place: the auto press is withdrawn, its charge given back, before anything acted
 *   (`AutoActOverridden`). A use already past that tick acts on its own, as a gun's shot in flight.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { slotHoldingItem } from '../../../systems/vehicle/loadoutState'
import {
  itemChargesOf,
  powerUpStateOf,
  withPending,
  withPowerUpState,
  type PendingUse,
} from './chargeState'
import { powerUpAutoFiredOf } from './powerUpEvents'
import { powerUpOfItem, type PowerUp } from './powerUpKind'
import { isPressableSlot, type PressableSlot } from './powerUpSlots'
import { refusalOfUse } from './useRefusals'
import { returnCharge, startUse } from './useResolution'

/** Auto's own aim for an item that aims at nothing: its target is the threat it answers. */
export const POWER_UP_AUTO_AIM = 0

/** The press, as a key would make it; nothing happens when a key's press would be refused. */
export function pressItemOnAuto(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tick: number,
): RuleEffect {
  const slot = pressableSlotHolding(state, playerId, itemId)
  if (slot === null || refusalOfUse(state, playerId, slot, tick) !== null) return unchanged(state)
  const powerUp = powerUpOfItem(itemId) as PowerUp
  const start = { powerUp, slot, tick, milestone: null, pressedBy: 'auto' as const }
  const started = startUse(state, playerId, start)
  const fired = powerUpAutoFiredOf({ playerId, itemId, slot })
  return { state: started.state, events: [fired, ...started.events] }
}

/** The first tick the item may act on auto, or null while a use of the player's is pending. */
export function autoUseReadyTickOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): number | null {
  const value = powerUpStateOf(state, playerId)
  return value.pending === null ? itemChargesOf(value, itemId).readyAtTick : null
}

/** The state with the auto press of `slot` made this very tick withdrawn; else unchanged. */
export function withdrawSameTickAutoPress(
  state: AuthorityState,
  playerId: string,
  slot: string,
  tick: number,
): RuleEffect {
  const pending = powerUpStateOf(state, playerId).pending
  if (pending === null || !isAutoPressOf(pending, slot, tick)) return unchanged(state)
  return {
    state: withAutoPressWithdrawn(state, playerId, pending),
    events: [{ type: 'AutoActOverridden', itemId: pending.itemId, aim: POWER_UP_AUTO_AIM }],
  }
}

function isAutoPressOf(pending: PendingUse, slot: string, tick: number): boolean {
  return pending.autoPressTick === tick && pending.slot === slot
}

/** No use pending, and the charge the auto press reserved given back. */
function withAutoPressWithdrawn(
  state: AuthorityState,
  playerId: string,
  pending: PendingUse,
): AuthorityState {
  const cleared = withPowerUpState(
    state,
    playerId,
    withPending(powerUpStateOf(state, playerId), null),
  )
  return returnCharge(cleared, playerId, pending.itemId)
}

function pressableSlotHolding(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): PressableSlot | null {
  const slot = slotHoldingItem(vehicleOf(state, playerId).loadout, itemId)
  return slot !== null && isPressableSlot(slot) ? slot : null
}
