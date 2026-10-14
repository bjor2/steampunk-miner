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
 *   next step's bound is measured. Casing rings follow the cut at fixed spacing
 *   (`layCasingAlongCut`).
 */
import { DENSITY_CELL_UNITS, TERRAIN_EDIT_UNITS_PER_TICK } from '../../constants/terrainBudget'
import type { DrillBit } from '../vehicle/aheadBearingLatch'
import type { DriveSigns } from '../vehicle/driveSigns'
import { drillStampOf } from '../vehicle/drillStamp'
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
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { isTileYielded, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { layCasingAlongCut } from './casingPlacement'
import { chainEffects, type RuleEffect } from './commandRule'
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

/** Density cells one drill step may touch: the whole per-tick terrain budget. */
export const DRILL_CELLS_PER_TICK = TERRAIN_EDIT_UNITS_PER_TICK / DENSITY_CELL_UNITS

/** What a drill step cuts with: the last reported pose at the step's position, its drive and lift. */
export interface SweptStep {
  pose: VehiclePose
  drive: DriveSigns
  isLifting: boolean
}

/** A step's path and the stamp at its end. */
interface Sweep {
  step: SweptStep
  stamp: DiscStamp
  path: SweepPath
}

/** A sweep's carve and the sub-step it reached, or -1 when a fresh path could cut nothing. */
interface SweptCarve extends DrillCarve {
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
  const sweep = sweepOf(vehicleOf(state, playerId).sweptCut, step, state.tick)
  const carve = (request: DrillCarveRequest) => carveSweep(state, params, playerId, sweep, request)
  const outcome = drillGroundBy(state, params, playerId, { tile: target, carve }, 1, SUB_STEP_CLOCK)
  return settleSweep(outcome, playerId, sweep)
}

function sweepOf(cursor: SweptCut | undefined, step: SweptStep, tick: number): Sweep {
  const stamp = drillStampOf(step.pose, step.isLifting)
  return { step, stamp, path: sweepPathOf(cursor, step.pose, stamp, tick) }
}

function carveSweep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  sweep: Sweep,
  request: DrillCarveRequest,
): SweptCarve {
  const isStop = (tile: TilePoint) => isStopCell(request.world, params, request.gates, tile)
  const clear = lastClearStep(sweep.path, isStop)
  if (clear < 0) return emptyCarveOf(request.world)
  return carveWithinBudget(state, params, playerId, { sweep, request, clear })
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

interface BudgetedCut {
  sweep: Sweep
  request: DrillCarveRequest
  /** The furthest sub-step the gates leave clear. */
  clear: number
}

/** The furthest clear sub-step whose stamp and gear fit the budget, carved. */
function carveWithinBudget(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request, clear }: BudgetedCut,
): SweptCarve {
  for (let reached = clear; ; reached--) {
    const bit = bitAt(sweep, reached)
    const read = drillGearReadAt(state, params, playerId, bit, request.gates)
    if (reached === 0 || cellsTouchedBy(bit.disc, read) <= DRILL_CELLS_PER_TICK) {
      return { ...carveStampWithRead(params, bit, read, request), reachedStep: reached }
    }
  }
}

function bitAt({ step, path, stamp }: Sweep, reached: number): DrillBit {
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
  { step }: Sweep,
  reached: StampPoint,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const cursor: SweptCut = {
    ...reached,
    poseXMm: step.pose.x,
    poseYMm: step.pose.y,
    facing: step.pose.facing,
    tick: state.tick,
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
