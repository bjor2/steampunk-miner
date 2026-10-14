/**
 * The twists' item hooks (K1's `twist` point, GD lock on #206, decisions 1 and 3): each twist
 * answers 1 at its base item's decision point while the player holds it, and nothing otherwise.
 * The lane asks with base 0 and ceiling 1, so the answer only says "play the twist": what the
 * twisted play does, and that it stays under the base item's cap, is the lane's own rule, built
 * from the base item's current values (#162 4.6). A twist that adds yield names its base item's
 * `incomeItemId` (decision 9 as amended).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { ScalarItemHook } from '../../../systems/registries/itemHooks'
import { TWISTS, type Twist } from './twistCatalogue'

/** The one answer a twist gives: the lane plays its twisted rule. */
export const TWIST_ON = 1

export const TWIST_HOOKS: readonly ScalarItemHook[] = TWISTS.map(twistHookOf)

/** Whether `playerId` holds `twist` as the run's one artefact. */
export function isTwistHeld(state: AuthorityState, playerId: string, twist: Twist): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  return state.players[playerId].artefact?.id === twist.optionId
}

function twistHookOf(twist: Twist): ScalarItemHook {
  return {
    id: twist.hookId,
    hook: 'twist',
    laneId: twist.laneId,
    parentItemId: twist.baseItemId,
    ...(twist.incomeItemId !== undefined && { incomeItemId: twist.incomeItemId }),
    answer: (state, playerId) => (isTwistHeld(state, playerId, twist) ? TWIST_ON : null),
  }
}
