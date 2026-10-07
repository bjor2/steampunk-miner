/**
 * The tech tree slice (#165, spec #161): the `tech-node` and `tech-combo-template` kinds the lane
 * slices register into, the rules over them, the `tech-tree` save section, the `unlock_node`
 * command, its run events, the pacing bot's research purchase, the debug actions, and the tree
 * screen with its HUD button. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { techTreeDebugActions } from './debug'
import { TECH_TREE_PROJECTIONS, TECH_TREE_RUN_EVENTS } from './logging'
import { RESEARCH_BOT_PURCHASE } from './systems/researchBotPurchase'
import { TECH_TREE_RULES } from './systems/techTreeCommands'
import { TECH_TREE_SECTION } from './systems/techTreeSection'
import { TechTreeButton } from './ui/TechTreeButton'
import { TECH_TREE_SCREEN_ID, TechTreeScreen } from './ui/TechTreeScreen'

export const slice: SliceDefinition = {
  id: 'tech-tree',
  register(r) {
    r.saveSection(TECH_TREE_SECTION)
    r.commandRules(TECH_TREE_RULES)
    r.eventProjections(TECH_TREE_PROJECTIONS)
    r.runEvents(TECH_TREE_RUN_EVENTS)
    r.botPurchase(RESEARCH_BOT_PURCHASE)
    // steampunkDebug.features['tech-tree'].unlockAll() / jumpToDepth(n) / shapeProblems()
    r.debugActions(techTreeDebugActions)
    r.screen({ id: TECH_TREE_SCREEN_ID, priority: 0, render: TechTreeScreen })
    r.hudPanel({ id: 'tech-tree.open', slot: 'position', Panel: TechTreeButton })
  },
}
