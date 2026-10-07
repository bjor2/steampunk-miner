/**
 * The tech tree slice (#165, spec #161): the `tech-node` and `tech-combo-template` kinds the lane
 * slices register into, the rules over them, the `tech-tree` save section, the `unlock_node`
 * command, its run events, the pacing bot's research and item purchases, the store's research
 * answer (ticket 248), the debug actions, the tree screen with its HUD button, the mounted gear's
 * art assets (#166), and the gear, Mark plates and power-up effects drawn on the rig (ticket 250).
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { techTreeDebugActions } from './debug'
import { POWER_UP_FX_LAYER_ID, PowerUpFxLayer } from './scene/PowerUpFxLayer'
import { POWER_UP_FX_BUDGET } from './scene/powerUpFxPools'
import { RIG_GEAR_PIECE_ID, RigGearPiece } from './scene/RigGearPiece'
import { techGearArtAssets } from './systems/render/techGear'
import { TECH_TREE_PROJECTIONS, TECH_TREE_RUN_EVENTS } from './logging'
import { ITEM_BOT_PURCHASE, ITEM_RESEARCH } from './systems/itemShop'
import { RESEARCH_BOT_PURCHASE } from './systems/researchBotPurchase'
import { TECH_TREE_RULES } from './systems/techTreeCommands'
import { TECH_TREE_SECTION } from './systems/techTreeSection'
import { TechTreeButton } from './ui/TechTreeButton'
import { TECH_TREE_SCREEN_ID, TechTreeScreen } from './ui/TechTreeScreen'

export const slice: SliceDefinition = {
  id: 'tech-tree',
  register(r) {
    r.saveSection(TECH_TREE_SECTION)
    // The mounted gear's Blender assets (#166), under public/assets/vehicle/ (#214).
    r.artAssets(techGearArtAssets())
    // That gear on the car, each cradle's Mark plate, and the power-up effects (ticket 250).
    r.vehiclePiece({ id: RIG_GEAR_PIECE_ID, Piece: RigGearPiece })
    r.sceneLayer({ id: POWER_UP_FX_LAYER_ID, Layer: PowerUpFxLayer, budget: POWER_UP_FX_BUDGET })
    r.commandRules(TECH_TREE_RULES)
    r.eventProjections(TECH_TREE_PROJECTIONS)
    r.runEvents(TECH_TREE_RUN_EVENTS)
    r.botPurchase(RESEARCH_BOT_PURCHASE)
    // buyVehicleItem sells only what the tree researched; the bot buys it before researching more.
    r.vehicleItemResearch(ITEM_RESEARCH)
    r.botPurchase(ITEM_BOT_PURCHASE)
    // steampunkDebug.features['tech-tree'].unlockAll() / jumpToDepth(n) / shapeProblems() /
    // getRig() / previewPowerUpFx(itemId)
    r.debugActions(techTreeDebugActions)
    r.screen({ id: TECH_TREE_SCREEN_ID, priority: 0, render: TechTreeScreen })
    r.hudPanel({ id: 'tech-tree.open', slot: 'position', Panel: TechTreeButton })
  },
}
