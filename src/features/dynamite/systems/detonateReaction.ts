/**
 * The plant key becomes Detonate while a charge is live (#153: one rack, one verb), through the
 * slices' input reactions (#217): while the kernel has nothing to plant, `plant_charge` asks this
 * reaction, which submits the plunger once `remote_detonator` is open. Before that, or with no
 * live charge, it gives nothing, so nothing is buffered or logged. Inside the interlock the press
 * is still submitted: the authority's clunk (`detonate_refused {in_radius}`) is the answer.
 */
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { InputSituation } from '../../../systems/input/inputRouting'
import type { TouchBindingRule } from '../../../systems/input/touchBindings'
import type { InputReactionEntry } from '../../../systems/registries/inputReactions'
import { DETONATE_INTENT } from './dynamiteCommands'
import { REMOTE_DETONATOR_ROW_ID } from './dynamiteSizes'
import { isDetonateOffered } from './plunger'

export const DETONATE_REACTION: InputReactionEntry = {
  id: 'dynamite.detonate_charge',
  actionId: 'plant_charge',
  contexts: ['vehicle'],
  toIntent: detonateIntentOf,
}

/**
 * On touch the plunger is the cluster's plant button (#474): a tap of `plant_charge`, as B is, so
 * the row draws no tile of its own and rides the kernel's button.
 */
export const DETONATE_TOUCH_BINDING: TouchBindingRule = {
  id: 'dynamite.remote_detonator',
  anchor: { row: REMOTE_DETONATOR_ROW_ID },
  touch: { gesture: 'tap', action: 'plant_charge' },
}

function detonateIntentOf({ state, playerId }: InputSituation): CommandIntent | null {
  return isDetonateOffered(state, playerId) ? DETONATE_INTENT : null
}
