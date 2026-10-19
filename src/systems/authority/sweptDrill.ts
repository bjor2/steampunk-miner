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
 * - **The work picks how far; the budget never does** (ticket 399, the TD ruling on #399 amending
 *   #335): the tick's work and the cursor's carry pay the crossed cells in order
 *   (`vehicle/carryWalk.ts`, `sweptCarry.ts`), the cut reaches the last one paid and the rest of
 *   the work carries exactly to the next tick. The per-cell budget (ticket 335, `cutShare.ts`)
 *   only picks the walks, the caller's `SweepWalks`: per cell within the player's share of
 *   `DRILL_CELLS_PER_TICK`, in runs and as the span per chunk over it.
 * - **The cut rides its front** (ticket 570, the TD shape on #570): the stamp's centre sits where
 *   the body's face will be after this tick's step (`sweptStampAheadMmOf`, the step from
 *   `frontStepMmAt`), and the stamp lowers each sample once, as the front crosses it
 *   (`world/cutFront.ts`), so the face moves with the body and no cell vanishes in one frame. A
 *   paid cell is cleared as the front passes it; where the work falls short of a cell, the front
 *   bites into it as far as the work pays (`sweptFront.ts`).
 * - The tick settles in `sweptSettle.ts`: the cursor moves to where the walk reached, a standing
 *   cell is reported once, and casing rings follow the cut at fixed spacing.
 * - The swept span (`sweptSpanDrill.ts`, ticket 374) cuts the same tick through `drillSweepBy`
 *   with its stamp walked per chunk; everything else here is shared.
 * - With the authority dev flag `drill.sweptLawCharge` on (ticket 540) the tick is charged on the
 *   law work it removed (`lawSubStepClockOf`), the same carve; off, each broken cell's dig energy.
 * - The tick counts in the rig's drill quantum (ticket 558, `vehicle/drillQuantum.ts`): 60 sub-steps
 *   a tick, doubled for a rig whose band-1 cells would cost fewer than 100, so no rig is held to
 *   the old 3600 m/s one-sub-step floor; the cursor keeps the quantum its carry and dig time are in.
 */
import { flagsOf } from './devFlagState'
import { isCutGateOpen, type CutGate } from '../vehicle/cutGate'
import type { DriveSigns } from '../vehicle/driveSigns'
import { walkCarryPerCell, type CarryWalk } from '../vehicle/carryWalk'
import { sweepPathOf, type SweepPath } from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import { walkStampInRows, type StampWalk } from '../world/groundEdit'
import type { TilePoint } from '../world/tileGrid'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import { cutGateAt, type CutFollowStep } from './cutFollowRead'
import { perCellShareAt } from './cutShare'
import { digSubStepsOfCells } from './drillCutTally'
import type { DrillCarve, DrillCarveRequest } from './drillGearCut'
import {
  drillGroundBy,
  lawSubStepClockOf,
  subStepClockOf,
  type DrillClock,
  type DrillOutcome,
} from './groundDrill'
import { drillQuantumAt, stepBoundsAt } from './stepBoundRead'
import {
  carveSweepAheadOfTravel,
  carveSweepToFront,
  type CarveBy,
  type SweepRequest,
} from './sweptCarve'
import { settleSweep } from './sweptSettle'
import { cursorOnBodyLine, sweptStampAt } from './sweptStampAt'

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
  /**
   * Where a cutting step's carve runs from (ticket 570, `sweptStampAt.ts`): the stamp pulled back
   * to the body, or the point the casing rings behind the last front leave free.
   */
  rear: StampPoint
  path: SweepPath
  gate: CutGate
  share: number
  /** The step the rig may take next while it cuts (ticket 334's cutting bound). */
  cuttingMm: number
  /** The sub-steps a tick the rig's cut counts in (ticket 558, `vehicle/drillQuantum.ts`). */
  quantum: number
}

/**
 * A sweep's carve, the sub-step it reached (-1 when a fresh path starts in a hard stop), the cells
 * its stamp and gear touched, counted no further than one past the share (`cutCellsWithin`), the
 * work it carries to the next tick, the cells its carry paid in walk order with what each was paid,
 * and the cell the carry works toward (null with none).
 */
export interface SweptCarve extends DrillCarve {
  reachedStep: number
  cells: number
  carrySubSteps: number
  paid: readonly TilePoint[]
  paidPrices: readonly number[]
  carryTarget: TilePoint | null
  /** Where a cutting tick's bite left its front past the reach (ticket 570); absent with none. */
  front?: StampPoint
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
  return drillSweepBy(state, params, playerId, { target, step }, IN_ROWS).effect
}

/** How a tick's clear sweep is walked: in the per-cell rows, or as the span per chunk. */
export type ClearSweepWalk = (cut: ClearSweep) => StampWalk

/** How a tick is walked: its carry over the crossed cells, then its stamp's samples. */
export interface SweepWalks {
  carryOf: (sweep: Sweep) => CarryWalk
  stampOf: ClearSweepWalk
}

/** The per-cell walks, whatever the cells: the reference every other walk must equal. */
export const IN_ROWS: SweepWalks = {
  carryOf: () => walkCarryPerCell,
  stampOf: () => walkStampInRows,
}

/** A drill step's tick: the cell it is said to work on and the step it cuts with. */
export interface SweptTick {
  target: TilePoint
  step: SweptStep
}

/**
 * One tick of the swept cut, walked as `walks` picks: the carry decides the reach, the one drill
 * path charges and collects the cut, and the cursor and rings settle where it reached.
 */
export function drillSweepBy(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { target, step }: SweptTick,
  walks: SweepWalks,
): DrillOutcome<SweptCarve> {
  const sweep = sweepOf(state, playerId, step)
  const by = { state, params, playerId, walks }
  const carve = (request: DrillCarveRequest) => carveSweep(by, { sweep, request })
  const outcome = drillGroundBy(
    state,
    params,
    playerId,
    { tile: target, carve },
    1,
    sweptClockOf(state, sweep.quantum),
  )
  const yielded = outcome.carved?.yielded ?? []
  const digSubSteps = digSubStepsOfCells(state, params, playerId, {
    yielded,
    quantum: sweep.quantum,
  })
  return { effect: settleSweep(outcome, playerId, { sweep, digSubSteps }), carved: outcome.carved }
}

/**
 * The clock a swept tick is charged on, by the session's flags (ticket 547), in the rig's drill
 * quantum (ticket 558).
 */
function sweptClockOf(state: AuthorityState, quantum: number): DrillClock {
  return flagsOf(state)['drill.sweptLawCharge']
    ? lawSubStepClockOf(quantum)
    : subStepClockOf(quantum)
}

function sweepOf(state: AuthorityState, playerId: string, step: SweptStep): Sweep {
  const { cuttingMm } = stepBoundsAt(state, playerId)
  const read = cutFollowStepOf(step)
  const gate = cutGateAt(state, playerId, read)
  const { pose, isLifting } = step
  const placed = sweptStampAt(state, playerId, { pose, isLifting, read, gate })
  const { stamp, aheadMm, rear } = placed
  const cursor = cursorOnBodyLine(vehicleOf(state, playerId).sweptCut, placed, gate)
  return {
    step,
    stamp,
    rear,
    cuttingMm,
    path: sweepPathOf(cursor, step.pose, { stamp, aheadMm }, state.tick),
    gate,
    share: perCellShareAt(state, playerId),
    quantum: drillQuantumAt(state, playerId),
  }
}

/** The step as the cut-follow reads it: at the step's position, drilling. */
function cutFollowStepOf({ pose, isLifting }: SweptStep): CutFollowStep {
  return { x: pose.x, y: pose.y, facing: pose.facing, isLifting, isDrilling: true }
}

/**
 * The tick's carve, by the gate its step read (`sweptCarve.ts`): to the front while it cuts, ahead
 * of the body while it travels.
 */
function carveSweep(by: CarveBy, cut: SweepRequest): SweptCarve {
  if (isCutGateOpen(cut.sweep.gate)) return carveSweepToFront(by, cut)
  return carveSweepAheadOfTravel(by, cut)
}

/** A sweep whose work reaches `clear`, and the cells that sweep touches. */
export interface ClearSweep extends SweepRequest {
  /** The furthest sub-step the work reaches. */
  clear: number
  /** Its stamp's and gear's cells, counted no further than one past the share. */
  cells: number
}
