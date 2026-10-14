/**
 * A use by hand of an item on auto (ticket 328, the Gameplay rules of #317 the ticket adopts):
 * the manual press wins, and auto then waits the item's override gap (`manualWaitTicks`, 60 ticks
 * for the alarm shield) before it may act again. The wait rides the item's one cooldown clock,
 * `readyAtTick`, as #317 folds the sear's wait into the gun's `nextShotTick`: the cooldown a use
 * by hand starts is the longer of the item's own and that gap. A use auto made, or any use with
 * the item's auto mode off, cools down exactly as before.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { autoActorOf } from '../../../systems/authority/autoMode/autoActorList'
import { isAutoModeOn } from '../../../systems/authority/autoMode/autoModeState'
import type { PendingUse } from './chargeState'
import type { PowerUp } from './powerUpKind'

/** The ticks from the act to the item's next use. */
export function cooldownTicksAfterActOf(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  pending: PendingUse,
): number {
  return Math.max(powerUp.cooldownTicks, manualWaitTicksOf(state, playerId, pending))
}

function manualWaitTicksOf(state: AuthorityState, playerId: string, pending: PendingUse): number {
  if (pending.autoPressTick !== undefined) return 0
  if (!isAutoModeOn(state, playerId, pending.itemId)) return 0
  return autoActorOf(pending.itemId)?.settingsOf(state, playerId)?.manualWaitTicks ?? 0
}
