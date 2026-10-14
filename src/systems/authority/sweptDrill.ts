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
 * - **The whole clear sweep every tick** (ticket 335, `cutShare.ts`): the cut reaches the last
 *   sub-step its gates leave clear, however long the step. The per-cell budget only picks the walk:
 *   the caller's `ClearSweepWalk`, the per-cell rows within the player's share of
 *   `DRILL_CELLS_PER_TICK` and the span per chunk over it; nothing carries to the next tick.
 * - The tick settles in `sweptSettle.ts`: the cursor moves to where the cut reached, a standing
 *   cell is reported once, and casing rings follow the cut at fixed spacing.
 * - The stamp's front sits further ahead than a report's by the step the rig may take while it
 *   cuts (`sweptStampAheadMmAt`, tickets 333 and 334), so this tick's cut always clears the step
 *   the body may take next tick.
 * - The swept span (`sweptSpanDrill.ts`, ticket 374) cuts the same tick through `drillSweepBy`
 *   with its stamp walked per chunk; everything else here is shared.
 */
import type { DrillBit } from '../vehicle/aheadBearingLatch'
import type { CutGate } from '../vehicle/cutGate'
import type { DriveSigns } from '../vehicle/driveSigns'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import { lastClearStep, sweepPathOf, sweptStampOf, type SweepPath } from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp } from '../world/stampShape'
import { walkStampInRows, type StampWalk } from '../world/groundEdit'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { isTileYielded, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import { cutGateAt } from './cutFollowRead'
import { cutCellsWithin, perCellShareAt } from './cutShare'
import {
  carveStampWithRead,
  drillGearReadAt,
  type DrillCarve,
  type DrillCarveRequest,
} from './drillGearCut'
import type { DrillGates } from './drillGates'
import { drillGroundBy, SUB_STEP_CLOCK, type DrillOutcome } from './groundDrill'
import { sweptStampAheadMmAt } from './stepBoundRead'
import { settleSweep } from './sweptSettle'

/** What a drill step cuts with: the last reported pose at the step's position, its drive and lift. */
export interface SweptStep {
  pose: VehiclePose
  drive: DriveSigns
  isLifting: boolean
}

/**
 * A step's path, the stamp at its end, the cut gate read before it cuts (ticket 333), and the
 * player's per-cell share this tick (ticket 335).
 */
export interface Sweep {
  step: SweptStep
  stamp: DiscStamp
  path: SweepPath
  gate: CutGate
  share: number
}

/**
 * A sweep's carve, the sub-step it reached (-1 when a fresh path could cut nothing) and the cells
 * its stamp and gear touched, counted no further than one past the share (`cutCellsWithin`).
 */
export interface SweptCarve extends DrillCarve {
  reachedStep: number
  cells: number
}

/**
 * Whether the drill steps since the vehicle's last charged report already cut its drill ticks:
 * the report then neither cuts them again nor records their casing axis.
 */
export function isCutBySteps(vehicle: VehicleState): boolean {
  return vehicle.sweptCut !== undefined && vehicle.sweptCut.tick > vehicle.accountedTick
}

/**
 * One tick of the swept cut at `state.tick` by the per-cell walk, whatever its length: the
 * reference the span must equal (ticket 374). Call with a planet that has params.
 */
export function drillAlongSweep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
): RuleEffect {
  return drillSweepBy(state, params, playerId, { target, step }, walkInRows).effect
}

/** How a tick's clear sweep is walked: in the per-cell rows, or as the span per chunk. */
export type ClearSweepWalk = (cut: ClearSweep) => StampWalk

/** The per-cell walk, whatever the cells. */
export const walkInRows: ClearSweepWalk = () => walkStampInRows

/** A drill step's tick: the cell it is said to work on and the step it cuts with. */
export interface SweptTick {
  target: TilePoint
  step: SweptStep
}

/**
 * One tick of the swept cut, its clear sweep walked as `walkOf` picks: the gates stop the sweep,
 * the one drill path charges and collects it, and the cursor and rings settle where it reached.
 */
export function drillSweepBy(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { target, step }: SweptTick,
  walkOf: ClearSweepWalk,
): DrillOutcome<SweptCarve> {
  const sweep = sweepOf(state, playerId, step)
  const carve = (request: DrillCarveRequest) =>
    carveSweep(state, params, playerId, { sweep, request }, walkOf)
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
    share: perCellShareAt(state, playerId),
  }
}

/** A sweep and the drill command's carve request. */
interface SweepRequest {
  sweep: Sweep
  request: DrillCarveRequest
}

/** The whole sweep up to its furthest clear sub-step, walked as `walkOf` picks for its cells. */
function carveSweep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request }: SweepRequest,
  walkOf: ClearSweepWalk,
): SweptCarve {
  const isStop = (tile: TilePoint) => isStopCell(request.world, params, request.gates, tile)
  const clear = lastClearStep(sweep.path, isStop)
  if (clear < 0) return emptyCarveOf(request.world)
  const bit = bitAt(sweep, clear)
  const read = drillGearReadAt(state, params, playerId, bit, request.gates)
  const cells = cutCellsWithin(bit.disc, read, sweep.share)
  const carved = carveStampWithRead(
    params,
    bit,
    read,
    request,
    walkOf({ sweep, request, clear, cells }),
  )
  return { ...carved, reachedStep: clear, cells }
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
    cells: 0,
  }
}

/** A sweep whose gates leave it clear up to `clear`, and the cells that clear sweep touches. */
export interface ClearSweep extends SweepRequest {
  /** The furthest sub-step the gates leave clear. */
  clear: number
  /** Its stamp's and gear's cells, counted no further than one past the share. */
  cells: number
}

/** The drill bit reaching sub-step `reached` of the sweep. */
function bitAt({ step, path, stamp }: Sweep, reached: number): DrillBit {
  return { pose: step.pose, disc: sweptStampOf(path, stamp, reached), drive: step.drive }
}
