/**
 * The Damp Flask's press (ticket 881; the TD's seam on #850): the kernel's `use_kit_tool` (U, or
 * LB+Y on a pad, and the flask's cell on the bar) uncorks a flask while the rig carries one. With
 * a flask still open the press is sent anyway, and the authority's `flask_open` refusal is the
 * answer, as the plunger's clunk is; with none carried it gives nothing, so nothing is sent.
 */
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { InputSituation } from '../../../systems/input/inputRouting'
import type { InputReactionEntry } from '../../../systems/registries/inputReactions'
import { flaskStateOf, UNCORK_FLASK_INTENT } from './flaskRules'

export const USE_KIT_TOOL_ACTION = 'use_kit_tool'

export const UNCORK_FLASK_REACTION: InputReactionEntry = {
  id: 'planet-kit.uncork_flask',
  actionId: USE_KIT_TOOL_ACTION,
  contexts: ['vehicle'],
  toIntent: uncorkIntentOf,
}

function uncorkIntentOf({ state, playerId }: InputSituation): CommandIntent | null {
  return flaskStateOf(state, playerId, state.tick).carried > 0n ? UNCORK_FLASK_INTENT : null
}
