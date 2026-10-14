/**
 * The swept cut (TD scope on #316 with its addendum, as the GD locked it; ticket 330): a
 * `drillStep` cuts one tick along the path its stamp swept since the last step (`sweptCut.ts`),
 * through the one drill path (`drillGroundBy`) with drill time in sub-steps, so a cell clears in
 * its fractional #7 time whatever the step's length.
 *
 * - **Gates on every crossed cell** (Horizontal Scaler): the stamp's centre walks the path, and
 *   each cell it crosses answers the drill's gates and scratch floor first; the sweep stops before
 *   one the drill cannot cut, which is reported as the drill reports it (`DrillGated`), and so never
 *   reaches the cells behind it.
 * - **Terrain budget** (`terrainBudget.ts`, item 1 now enforced): a step touches at most
 *   `DRILL_CELLS_PER_TICK` density cells, its stamp's and its drill gear's. A longer sweep stops at
 *   the last sub-step that fits and the next step resumes from there; nothing is trimmed silently.
 *   A bare stamp and its gear always fit, so the cursor's own disc is never refused.
 * - A standing cell is reported once as the sweep meets it: a step that continues its cursor
 *   leaves out the cells its start's disc already reached, and one that made no headway reports
 *   none, so holding the drill against a gate does not repeat it every tick.
 * - The cursor moves to where the cut reached, keeping the step's own position, from which the
 *   next step's bound is measured, and the cut gate read before the cut (`cutFollowRead.ts`,
 *   ticket 333). Casing rings follow the cut at fixed spacing (`layCasingAlongCut`).
 * - The stamp's front sits further ahead than a report's by the step the rig may take while it
 *   cuts (`sweptStampAheadMmAt`, tickets 333 and 334), so this tick's cut always clears the step
 *   the body may take next tick.
 * - The swept span (`sweptSpanDrill.ts`, ticket 374) cuts the same tick through `drillSweepBy`
 *   with its stamp walked per chunk and no terrain budget; everything else here is shared.
 */
import { DENSITY_CELL_UNITS, TERRAIN_EDIT_UNITS_PER_TICK } from '../../constants/terrainBudget'
import type { DrillBit } from '../vehicle/aheadBearingLatch'
import type { CutGate } from '../vehicle/cutGate'
import type { DriveSigns } from '../vehicle/driveSigns'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import {
  lastClearStep,
  pointAtStep,
  sweepPathOf,
  sweptStampOf,
  type SweepPath,
  type SweptCut,
} from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { PlanetParams } from '../world/planetParams'
import { discSamplesOf, type DiscStamp, type StampPoint } from '../world/stampShape'
import { walkStampInRows } from '../world/groundEdit'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { isTileYielded, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { layCasingAlongCut } from './casingPlacement'
import { chainEffects, type RuleEffect } from './commandRule'
import { cutGateAt } from './cutFollowRead'
import type { DomainEventBody } from './domainEvent'
import {
  carveStampWithRead,
  drillGearReadAt,
  type DrillCarve,
  type DrillCarveRequest,
  type DrillGearRead,
} from './drillGearCut'
import type { DrillGates } from './drillGates'
import { drillGroundBy, SUB_STEP_CLOCK, type DrillOutcome } from './groundDrill'
import { sweptStampAheadMmAt } from './stepBoundRead'

/** Density cells one drill step may touch: the whole per-tick terrain budget. */
export const DRILL_CELLS_PER_TICK = TERRAIN_EDIT_UNITS_PER_TICK / DENSITY_CELL_UNITS

/** What a drill step cuts with: the last reported pose at the step's position, its drive and lift. */
export interface SweptStep {
  pose: VehiclePose
  drive: DriveSigns
  isLifting: boolean
}

/** A step's path, the stamp at its end, and the cut gate read before it cuts (ticket 333). */
export interface Sweep {
  step: SweptStep
  stamp: DiscStamp
  path: SweepPath
  gate: CutGate
}

/** A sweep's carve and the sub-step it reached, or -1 when a fresh path could cut nothing. */
export interface SweptCarve extends DrillCarve {
  reachedStep: number
}

/**
 * Whether the drill steps since the vehicle's last charged report already cut its drill ticks:
 * the report then neither cuts them again nor records their casing axis.
 */
export function isCutBySteps(vehicle: VehicleState): boolean {
  return vehicle.sweptCut !== undefined && vehicle.sweptCut.tick > vehicle.accountedTick
}

/** One tick of the swept cut at `state.tick`; call with a planet that has params. */
export function drillAlongSweep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
): RuleEffect {
  return drillSweepBy(state, params, playerId, { target, step }, carveWithinBudget).effect
}

/** A drill step's tick: the cell it is said to work on and the step it cuts with. */
export interface SweptTick {
  target: TilePoint
  step: SweptStep
}

/** How a tick's sweep is carved once its gates' furthest clear sub-step is known. */
export type ClearSweepCarve = (
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  cut: ClearSweep,
) => SweptCarve

/**
 * One tick of the swept cut, carved by `carveClear`: the gates stop the sweep, the one drill path
 * charges and collects it, and the cursor and rings settle where it reached.
 */
export function drillSweepBy(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { target, step }: SweptTick,
  carveClear: ClearSweepCarve,
): DrillOutcome<SweptCarve> {
  const sweep = sweepOf(state, playerId, step)
  const carve = (request: DrillCarveRequest) =>
    carveSweep(state, params, playerId, { sweep, request }, carveClear)
  const outcome = drillGroundBy(state, params, playerId, { tile: target, carve }, 1, SUB_STEP_CLOCK)
  return { effect: settleSweep(outcome, playerId, sweep), carved: outcome.carved }
}

function sweepOf(state: AuthorityState, playerId: string, step: SweptStep): Sweep {
  const aheadMm = sweptStampAheadMmAt(state, playerId)
  const stamp = sweptDrillStampOf(step.pose, step.isLifting, aheadMm)
  const cursor = vehicleOf(state, playerId).sweptCut
  const { x, y } = step.pose
  return {
    step,
    stamp,
    path: sweepPathOf(cursor, step.pose, { stamp, aheadMm }, state.tick),
    gate: cutGateAt(state, playerId, { x, y, isLifting: step.isLifting, isDrilling: true }),
  }
}

/** A sweep and the drill command's carve request. */
interface SweepRequest {
  sweep: Sweep
  request: DrillCarveRequest
}

function carveSweep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request }: SweepRequest,
  carveClear: ClearSweepCarve,
): SweptCarve {
  const isStop = (tile: TilePoint) => isStopCell(request.world, params, request.gates, tile)
  const clear = lastClearStep(sweep.path, isStop)
  if (clear < 0) return emptyCarveOf(request.world)
  return carveClear(state, params, playerId, { sweep, request, clear })
}

/** A cell standing in the drill's way: solid, not yet opened, and one it cannot cut. */
function isStopCell(
  world: WorldState,
  params: PlanetParams,
  gates: DrillGates,
  tile: TilePoint,
): boolean {
  const cell = materialCellAt(world, params, tile)
  if (!isRemovableCell(cell) || isTileYielded(world, tile)) return false
  return gates.drillTicksOf(tile, cell, 0) === null
}

function emptyCarveOf(world: WorldState): SweptCarve {
  return {
    world,
    changes: [],
    yielded: [],
    ticksUsed: 0,
    casingCleared: { samples: 0, grade: 0 },
    gearQuanta: 0,
    aheadLatch: null,
    sideLatch: null,
    reachedStep: -1,
  }
}

/** A sweep whose gates leave it clear up to `clear`. */
export interface ClearSweep extends SweepRequest {
  /** The furthest sub-step the gates leave clear. */
  clear: number
}

/** The furthest clear sub-step whose stamp and gear fit the budget, carved in rows. */
function carveWithinBudget(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request, clear }: ClearSweep,
): SweptCarve {
  for (let reached = clear; ; reached--) {
    const bit = bitAt(sweep, reached)
    const read = drillGearReadAt(state, params, playerId, bit, request.gates)
    if (reached === 0 || cellsTouchedBy(bit.disc, read) <= DRILL_CELLS_PER_TICK) {
      const carved = carveStampWithRead(params, bit, read, request, walkStampInRows)
      return { ...carved, reachedStep: reached }
    }
  }
}

/** The drill bit reaching sub-step `reached` of the sweep. */
export function bitAt({ step, path, stamp }: Sweep, reached: number): DrillBit {
  return { pose: step.pose, disc: sweptStampOf(path, stamp, reached), drive: step.drive }
}

/** The density cells a stamp and its gear's cells reach. */
function cellsTouchedBy(disc: DiscStamp, read: DrillGearRead | null): number {
  const cells = cellsOfDisc(disc)
  for (const { tx, ty } of [...(read?.aheadCells ?? []), ...(read?.sideCells ?? [])]) {
    cells.add(`${tx},${ty}`)
  }
  return cells.size
}

function tileKeyOfSample(sx: number, sy: number): string {
  return `${Math.floor(sx / SAMPLES_PER_TILE)},${Math.floor(sy / SAMPLES_PER_TILE)}`
}

/** The cursor moves to the cut's reach, standing cells are reported once, rings follow the cut. */
function settleSweep(
  outcome: DrillOutcome<SweptCarve>,
  playerId: string,
  sweep: Sweep,
): RuleEffect {
  const { effect, carved } = outcome
  if (carved === null) return effect
  const reached = reachedPointOf(sweep.path, carved.reachedStep)
  const isCutting = carved.ticksUsed > 0
  return chainEffects(effect.state, [
    (current) => ({
      state: withCursorAt(current, playerId, sweep, reached),
      events: withoutStandingMetBefore(effect.events, sweep, carved.reachedStep),
    }),
    (current) => layCasingAlongCut(current, playerId, reached, isCutting),
  ])
}

/** A fresh path that could cut nothing stays at its start: the body. */
function reachedPointOf(path: SweepPath, reachedStep: number): StampPoint {
  return pointAtStep(path, Math.max(0, reachedStep))
}

function withCursorAt(
  state: AuthorityState,
  playerId: string,
  { step, gate }: Sweep,
  reached: StampPoint,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const cursor: SweptCut = {
    ...reached,
    poseXMm: step.pose.x,
    poseYMm: step.pose.y,
    facing: step.pose.facing,
    tick: state.tick,
    ...gate,
  }
  return withVehicle(state, playerId, { ...vehicle, sweptCut: cursor })
}

/**
 * `DrillGated` refused or blocked only where the sweep newly met the cell: a fresh step reports
 * all; a continuing one none when it made no headway, else none its start's disc already reached.
 */
function withoutStandingMetBefore(
  events: readonly DomainEventBody[],
  sweep: Sweep,
  reachedStep: number,
): DomainEventBody[] {
  if (sweep.path.isFresh) return [...events]
  const metBefore = cellsOfDisc({ ...sweep.stamp, ...sweep.path.from, tail: undefined })
  const isNewlyMet = (event: DomainEventBody) =>
    !isStandingGate(event) || (reachedStep > 0 && !metBefore.has(`${event.tx},${event.ty}`))
  return events.filter(isNewlyMet)
}

function cellsOfDisc(disc: DiscStamp): Set<string> {
  return new Set(discSamplesOf(disc).map(({ sx, sy }) => tileKeyOfSample(sx, sy)))
}

function isStandingGate(
  event: DomainEventBody,
): event is Extract<DomainEventBody, { type: 'DrillGated' }> {
  return event.type === 'DrillGated' && event.outcome !== 'lost'
}
