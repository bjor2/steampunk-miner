/**
 * The fire key's input reaction (ticket 314 on ticket 345, the TD lock on #314 section 2): the
 * kernel has no rule for `fire_ground_gun`, so it asks this reaction. The answer is
 * `ground_gun.fire` only while the gun is mounted and the recovery allows a shot now; otherwise
 * null, so no gun means nothing is sent or logged. There is no release intent: the hold is the
 * client's alone and the authority never stores a queued shot (TD 8 Oct), so letting go sends
 * nothing.
 */
import type { InputReactionEntry } from '../../../systems/registries/inputReactions'
import { FIRE_ACTION, pressFireKey } from './fireInput'

export const FIRE_KEY_REACTION: InputReactionEntry = {
  id: 'ground-gun.fire',
  actionId: FIRE_ACTION,
  contexts: ['vehicle'],
  toIntent: ({ state, playerId }) => pressFireKey(state, playerId),
}
