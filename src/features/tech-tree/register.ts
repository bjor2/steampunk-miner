/**
 * The tech tree slice (#165, spec #161): the `tech-node` and `tech-combo-template` kinds the lane
 * slices register into, the rules over them, the `tech-tree` save section, the `unlock_node`
 * command, its run events and the pacing bot's research purchase. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { TECH_TREE_PROJECTIONS, TECH_TREE_RUN_EVENTS } from './logging'
import { RESEARCH_BOT_PURCHASE } from './systems/researchBotPurchase'
import { TECH_TREE_RULES } from './systems/techTreeCommands'
import { TECH_TREE_SECTION } from './systems/techTreeSection'

export const slice: SliceDefinition = {
  id: 'tech-tree',
  register(r) {
    r.saveSection(TECH_TREE_SECTION)
    r.commandRules(TECH_TREE_RULES)
    r.eventProjections(TECH_TREE_PROJECTIONS)
    r.runEvents(TECH_TREE_RUN_EVENTS)
    r.botPurchase(RESEARCH_BOT_PURCHASE)
  },
}
