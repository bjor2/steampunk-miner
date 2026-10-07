/**
 * The dynamite slice (#149, spec #143; GD and TD locks on #149): the product surface of the size
 * ladder the kernel owns. The `dynamite-size` content with its icons (claiming `remote_detonator`),
 * the plunger `dynamite.detonate_charge` and its interlock, the plant key turning Detonate while a
 * charge is live, and the `detonate_refused` log line. The charges machine (plant, fuse, live
 * blast, rack, disarm) stays kernel. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { DYNAMITE_PROJECTIONS, DYNAMITE_RUN_EVENTS } from './logging'
import { DETONATE_REACTION } from './systems/detonateReaction'
import { DYNAMITE_RULES } from './systems/dynamiteCommands'
import { dynamiteSizes } from './systems/dynamiteSizes'

export const slice: SliceDefinition = {
  id: 'dynamite',
  register(r) {
    r.content('dynamite-size', dynamiteSizes())
    r.commandRules(DYNAMITE_RULES)
    r.inputReaction(DETONATE_REACTION)
    r.eventProjections(DYNAMITE_PROJECTIONS)
    r.runEvents(DYNAMITE_RUN_EVENTS)
  },
}
