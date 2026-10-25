/**
 * The acting flag of tools that act by context (ticket 881; the GD lock on #850, the TD's
 * `preCutContext` seam, G&V's hysteresis): every command that moves or cuts with the rig (a pose
 * report, a scripted cut, a drill step) first asks the registered hooks which owned tools have
 * their context at the rig, before the drill cuts, so a hazard cell broken in the same command
 * already meets the tool's factor and its trade-off.
 *
 * - **In context.** The tool starts acting, once (`ToolActingChanged`, `tool_acting`), and the
 *   tick is kept as its context last seen (`toolsSeenAt`).
 * - **Out of context.** It acts on until `tailTicks` after its context was last seen, then stops,
 *   once. A drive-only report clears it as a cut does, with no eventful command needed.
 *
 * With no hook, no planet, a rig that is not active or no tool owned, nothing is read or changed.
 */
import { DRILL_REACH_MM } from '../../../constants/balance'
import { MM_PER_METRE } from '../../../constants/physics'
import {
  preCutContexts,
  type PreCutContext,
  type RigAt,
  type ToolContext,
} from '../../registries/preCutContexts'
import {
  isToolActing,
  toolSeenTickOf,
  withToolSeenAt,
  type ToolSeenAt,
} from '../../vehicle/actingTools'
import { isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { planetParamsOf } from '../planetOfState'
import { hazardKindAtTile } from './hazardCells'
import { startToolActing, stopToolActing } from './toolActing'

const DRILL_REACH_SQ = DRILL_REACH_MM * DRILL_REACH_MM

/** The hooks' tools settled for the rig at `at` on `tick`; nothing at all with no hook. */
export function settleToolContexts(
  state: AuthorityState,
  playerId: string,
  at: RigAt | null,
  tick: number,
): RuleEffect {
  const hooks = preCutContexts()
  const params = planetParamsOf(state.planet)
  if (hooks.length === 0 || at === null || params === null) return unchanged(state)
  if (!isVehicleActive(vehicleOf(state, playerId))) return unchanged(state)
  return chainEffects(
    state,
    hooks.map(
      (hook) => (current: AuthorityState) =>
        settleHookTools(current, playerId, { hook, params, at, tick }),
    ),
  )
}

/**
 * The hazard kinds of the cells within the drill's reach of `at`, the rig's own cell among them
 * (`hazardKindAtTile`: a placed hazard, else the planet's pocket, cut or not).
 */
export function hazardKindsInDrillReach(
  state: AuthorityState,
  params: PlanetParams,
  at: RigAt,
): ReadonlySet<string> {
  const kinds = drillReachTilesOf(at).map((tile) => hazardKindAtTile(state, params, tile))
  return new Set(kinds.filter((kind): kind is string => kind !== null))
}

interface HookAtRig {
  hook: PreCutContext
  params: PlanetParams
  at: RigAt
  tick: number
}

function settleHookTools(
  state: AuthorityState,
  playerId: string,
  { hook, params, at, tick }: HookAtRig,
): RuleEffect {
  const contexts = hook.toolContextsOf(state, playerId, params, at)
  return chainEffects(
    state,
    contexts.map(
      (context) => (current: AuthorityState) =>
        settleTool(current, playerId, context, { toolId: context.toolId, tick }, hook.tailTicks),
    ),
  )
}

function settleTool(
  state: AuthorityState,
  playerId: string,
  context: ToolContext,
  now: ToolSeenAt,
  tailTicks: number,
): RuleEffect {
  if (context.isInContext) return seeToolContext(state, playerId, now)
  const isOver = isTailOver(vehicleOf(state, playerId), now, tailTicks)
  return isOver ? stopToolActing(state, playerId, now.toolId) : unchanged(state)
}

/** The tool acting, its context seen now. */
function seeToolContext(state: AuthorityState, playerId: string, now: ToolSeenAt): RuleEffect {
  const started = startToolActing(state, playerId, now.toolId)
  const vehicle = withToolSeenAt(vehicleOf(started.state, playerId), now.toolId, now.tick)
  return { state: withVehicle(started.state, playerId, vehicle), events: started.events }
}

/** Whether an acting tool's tail has run out: `tailTicks` since its context was last seen. */
function isTailOver(vehicle: VehicleState, now: ToolSeenAt, tailTicks: number): boolean {
  if (!isToolActing(vehicle, now.toolId)) return false
  const seen = toolSeenTickOf(vehicle, now.toolId)
  return seen === null || now.tick >= seen + tailTicks
}

/** The cells whose centres lie within the drill's reach of `at`. */
function drillReachTilesOf(at: RigAt): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let tx = tileOf(at.x - DRILL_REACH_MM); tx <= tileOf(at.x + DRILL_REACH_MM); tx++) {
    for (let ty = tileOf(at.y - DRILL_REACH_MM); ty <= tileOf(at.y + DRILL_REACH_MM); ty++) {
      if (isCentreInReach(at, { tx, ty })) tiles.push({ tx, ty })
    }
  }
  return tiles
}

function tileOf(mm: number): number {
  return Math.floor(mm / MM_PER_METRE)
}

function isCentreInReach(at: RigAt, tile: TilePoint): boolean {
  const dx = tile.tx * MM_PER_METRE + MM_PER_METRE / 2 - at.x
  const dy = tile.ty * MM_PER_METRE + MM_PER_METRE / 2 - at.y
  return dx * dx + dy * dy <= DRILL_REACH_SQ
}
