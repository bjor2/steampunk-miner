/**
 * The `groundReinforcement` seam (ticket 365, the GD ruling and TD lock on #157, both Scalers signed
 * off): a slice makes a cell permanent ground. A reinforced cell never collapses; it stays minable
 * at the hardness of the ground under it, and cutting it removes the reinforcement with it.
 * Collapse is the only reader (`authority/collapse/collapseReinforcement.ts`); hardness, drill_tip
 * gating and the swept span never read this seam.
 *
 * - **Derived, never stored.** A provider answers from its own saved section, O(1) per cell (a
 *   lookup, never a walk); the kernel keeps no copy and no cache.
 * - **No unlock gate here.** Ownership is checked once, when a player applies reinforcement; reads
 *   never check it, so a reinforced cell holds for every player (Horizontal Scaler).
 * - **Kernel guards first.** Before any provider is asked, a dynamite- or rig-gated cell, a core
 *   cell or lava is never reinforced, whatever a provider says.
 *
 * With nothing registered nothing is reinforced.
 */
import type { AuthorityState } from '../authority/authorityState'
import { gateOfTile, type GateAsker } from '../authority/cellGates'
import { planetParamsOf } from '../authority/planetOfState'
import { isLavaAt } from '../world/lavaFlow'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { materialCellAt } from '../world/worldState'
import { defineRegistry, entriesOf } from './seal'

export interface ReinforcementProvider {
  /** `<slice>.<name>`. */
  id: string
  /** Whether the cell at (tx, ty) is reinforced. Pure in state, O(1), its own section only. */
  reinforces(state: AuthorityState, tx: number, ty: number): boolean
}

export const REINFORCEMENT_REGISTRY = defineRegistry<ReinforcementProvider>('groundReinforcement')

/** The gate kinds #142 names a sealed shell and an extractor's cell by: never reinforced. */
const UNREINFORCEABLE_GATE_KINDS: ReadonlySet<string> = new Set(['dynamite', 'rig'])

/**
 * The `tool` the guard asks the gates as: a power-up's terrain edit is refused by every gated cell
 * (#142 "Constraints on other systems"), so a dynamite or rig gate always answers with its kind.
 */
const REINFORCEMENT_GATE_TOOL = 'groundReinforcement'

/** Whether any slice registered a provider: with none, collapse reads nothing more. */
export function hasReinforcementProviders(): boolean {
  return entriesOf(REINFORCEMENT_REGISTRY).length > 0
}

/** Any provider reinforces the cell, and no kernel guard bars it. */
export function isCellReinforced(state: AuthorityState, tx: number, ty: number): boolean {
  if (!hasReinforcementProviders() || isReinforcementBarred(state, { tx, ty })) return false
  return entriesOf(REINFORCEMENT_REGISTRY).some((provider) => provider.reinforces(state, tx, ty))
}

/** The kernel guards: no planet, lava, the core, or a dynamite or rig gate. */
function isReinforcementBarred(state: AuthorityState, tile: TilePoint): boolean {
  const params = planetParamsOf(state.planet)
  if (params === null) return true
  return isLavaOrCore(state, params, tile) || isUnreinforceableGate(state, params, tile)
}

function isLavaOrCore(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  if (isLavaAt(state.world, params, tile)) return true
  return kindOfCell(materialCellAt(state.world, params, tile)) === CELL_KIND.core
}

/**
 * A dynamite or rig gate is the cell's, not the asker's: any player asking hears the same kind, so
 * the lowest player id asks. With no player there is no one to ask, and nothing is reinforced.
 */
function isUnreinforceableGate(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
): boolean {
  const asker = gateAskerOf(state, params)
  if (asker === null) return true
  const gated = gateOfTile(asker, tile)
  return gated !== null && UNREINFORCEABLE_GATE_KINDS.has(gated.verdict.gateKind)
}

function gateAskerOf(state: AuthorityState, params: PlanetParams): GateAsker | null {
  const [playerId] = Object.keys(state.players).sort()
  if (playerId === undefined) return null
  return { state, playerId, params, blast: null, tool: REINFORCEMENT_GATE_TOOL }
}
