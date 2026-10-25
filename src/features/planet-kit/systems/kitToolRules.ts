/**
 * The three hazard tools acting by context (ticket 881, PK4c T1; the GD lock on #850 and G&V's
 * trigger): the Scree Plough in rockfall, the Shard Tongs at spinecrystal and the Vent Vane over a
 * steam vent. A tool acts while its home hazard's kind is at the rig's cell or within the drill's
 * reach, read before the drill cuts (the kernel's `preCutContext`), and for `tailTicks` after it
 * was last seen; the kernel logs each change once as `tool_acting`.
 *
 * Only while it acts (the HS's condition: never just because it is owned) the tool's hazard plays
 * at its factor (plough refill −50%, tongs bite −60%, vane shove −60%) and its track pays the
 * trade-off (thrust −10%, cut speed −25%, horizontal speed −30%), every number from `acting` in
 * `planet-kit.economy.json`. A player who owns none of them reads nothing here.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { hazardKindsInDrillReach } from '../../../systems/authority/hazards/toolContexts'
import type { ContactFactor } from '../../../systems/registries/contactEffects'
import type { PreCutContext, RigAt, ToolContext } from '../../../systems/registries/preCutContexts'
import type { ToolTradeOff } from '../../../systems/registries/toolTradeOffs'
import { isToolActing } from '../../../systems/vehicle/actingTools'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { TRADE_OFF_AXIS_OF_COST, type KitToolActing } from './kitActing'
import { kitHoldingsOf } from './kitHoldingsSection'
import { PLANET_KIT_ECONOMY, PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

/** A hazard tool as it acts: its rows and the hazard kind whose context it acts in. */
export interface ActingKitTool {
  /** `planet-kit.<item id>`: the trade-off row's id, the factor hook's and the acting flag's. */
  toolId: string
  item: KitItem
  hazard: string
  acting: KitToolActing
}

export const ACTING_KIT_TOOLS: readonly ActingKitTool[] =
  PLANET_KIT_ECONOMY.acting.tools.map(actingToolOf)

/** The trade-off each tool pays while it acts, on the track its row names. */
export const KIT_TOOL_TRADE_OFFS: readonly ToolTradeOff[] = ACTING_KIT_TOOLS.map((tool) => ({
  id: tool.toolId,
  axis: TRADE_OFF_AXIS_OF_COST[tool.item.tradeOff.costs] as ToolTradeOff['axis'],
  penaltyBp: tool.acting.penaltyBp,
  floorBp: tool.acting.floorBp,
}))

/** Each tool's factor on its hazard's contacts while it acts. */
export const KIT_TOOL_FACTORS: readonly ContactFactor[] = ACTING_KIT_TOOLS.map((tool) => ({
  id: tool.toolId,
  kind: tool.hazard,
  factorBpOf: (state, playerId) =>
    isToolActing(vehicleOf(state, playerId), tool.toolId) ? tool.acting.factorBp : null,
}))

/** The owned hazard tools, each in its context or not, before the drill cuts. */
export const KIT_TOOL_CONTEXTS: PreCutContext = {
  id: 'planet-kit.hazard_tools',
  tailTicks: PLANET_KIT_ECONOMY.acting.tailTicks,
  toolContextsOf: toolContextsAt,
}

/** `planet-kit.scree_plough` for `scree_plough`. */
export function kitToolIdOf(itemId: string): string {
  return `planet-kit.${itemId}`
}

function toolContextsAt(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  at: RigAt,
): readonly ToolContext[] {
  const owned = ownedActingTools(state, playerId)
  if (owned.length === 0) return []
  const kinds = hazardKindsInDrillReach(state, params, at)
  return owned.map((tool) => ({ toolId: tool.toolId, isInContext: kinds.has(tool.hazard) }))
}

function ownedActingTools(state: AuthorityState, playerId: string): ActingKitTool[] {
  const { tools } = kitHoldingsOf(state, playerId)
  return ACTING_KIT_TOOLS.filter((tool) => tools.includes(tool.item.id))
}

/** The guards (`planetKitGuards.ts`) hold every row to a hazard tool with a track to slow. */
function actingToolOf(acting: KitToolActing): ActingKitTool {
  const item = kitItemOf(PLANET_KITS, acting.itemId) as KitItem
  return { toolId: kitToolIdOf(item.id), item, hazard: item.effect.hazard as string, acting }
}
