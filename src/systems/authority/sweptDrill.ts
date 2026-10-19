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
 *   the work carries exactly to the next tick. A paid cell is cleared in full. The per-cell budget
 *   (ticket 335, `cutShare.ts`) only picks the walks, the caller's `SweepWalks`: per cell within
 *   the player's share of `DRILL_CELLS_PER_TICK`, in runs and as the span per chunk over it.
 * - The tick settles in `sweptSettle.ts`: the cursor moves to where the cut reached, a standing
 *   cell is reported once, and casing rings follow the cut at fixed spacing.
 * - The stamp's front sits further ahead than a report's by the step the rig may take while it
 *   cuts (`sweptStampAheadMmAt`, tickets 333 and 334), so this tick's cut always clears the step
 *   the body may take next tick.
 * - The swept span (`sweptSpanDrill.ts`, ticket 374) cuts the same tick through `drillSweepBy`
 *   with its stamp walked per chunk; everything else here is shared.
 * - With the authority dev flag `drill.sweptLawCharge` on (ticket 540) the tick is charged on the
 *   law work it removed (`lawSubStepClockOf`), the same carve; off, each broken cell's dig energy.
 * - The tick counts in the rig's drill quantum (ticket 558, `vehicle/drillQuantum.ts`): 60 sub-steps
 *   a tick, doubled for a rig whose band-1 cells would cost fewer than 100, so no rig is held to
 *   the old 3600 m/s one-sub-step floor; the cursor keeps the quantum its carry and dig time are in.
 */
import { flagsOf } from './devFlagState'
import type { DrillBit } from '../vehicle/aheadBearingLatch'
import type { CutGate } from '../vehicle/cutGate'
import type { DriveSigns } from '../vehicle/driveSigns'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import { walkCarryPerCell, type CarryReach, type CarryWalk } from '../vehicle/carryWalk'
import { sweepPathOf, sweptStampOf, type SweepPath } from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp } from '../world/stampShape'
import { walkStampInRows, type StampWalk } from '../world/groundEdit'
import { clearingPaidCellsFirst } from '../world/paidCellClear'
import type { TilePoint } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import {
  carryClampedToRelease,
  crossedInWalkOrder,
  heldCarryCellOf,
  releasingCarryGround,
} from './carryRelease'
import { cutGateAt } from './cutFollowRead'
import { cutCellsWithin, perCellShareAt } from './cutShare'
import { digSubStepsOfCells } from './drillCutTally'
import {
  carveStampWithRead,
  walkedWithBit,
  drillGearReadAt,
  type DrillCarve,
  type DrillCarveRequest,
} from './drillGearCut'
import {
  drillGroundBy,
  lawSubStepClockOf,
  subStepClockOf,
  type DrillClock,
  type DrillOutcome,
} from './groundDrill'
import { drillQuantumAt, stepBoundsAt, sweptStampAheadMmAt } from './stepBoundRead'
import { carryPurseOf, carrySweepOf, leavingCellToCarry, yieldedInWalkOrder } from './sweptCarry'
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
  const carve = (request: DrillCarveRequest) =>
    carveSweep(state, params, playerId, { sweep, request }, walks)
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
  const aheadMm = sweptStampAheadMmAt(state, playerId)
  const quantum = drillQuantumAt(state, playerId)
  const stamp = sweptDrillStampOf(step.pose, step.isLifting, aheadMm)
  const cursor = vehicleOf(state, playerId).sweptCut
  const { x, y } = step.pose
  return {
    step,
    stamp,
    cuttingMm,
    path: sweepPathOf(cursor, step.pose, { stamp, aheadMm }, state.tick),
    gate: cutGateAt(state, playerId, {
      x,
      y,
      facing: step.pose.facing,
      isLifting: step.isLifting,
      isDrilling: true,
    }),
    share: perCellShareAt(state, playerId),
    quantum,
  }
}

/** A sweep and the drill command's carve request. */
interface SweepRequest {
  sweep: Sweep
  request: DrillCarveRequest
}

/** The sweep as far as its work reaches, its paid cells cleared in full, walked as `walks` picks. */
function carveSweep(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request }: SweepRequest,
  walks: SweepWalks,
): SweptCarve {
  const reach = reachOfWork(state, params, playerId, { sweep, request }, walks.carryOf(sweep))
  if (reach.reachedStep < 0) return emptyCarveOf(request.world, reach.carrySubSteps)
  const bit = bitAt(sweep, reach.reachedStep)
  const read = drillGearReadAt(state, params, playerId, bit, request.gates)
  const cells = cutCellsWithin(bit.disc, read, sweep.share)
  const stampWalk = walks.stampOf({ sweep, request, clear: reach.reachedStep, cells })
  const held = heldCarryCellOf(reach.target, sweep.step.pose, sweep.cuttingMm)
  const carved = carveStampWithRead(
    params,
    bit,
    read,
    leavingCellToCarry(request, held),
    walkedWithBit(clearingPaidCellsFirst(reach.paid, stampWalk)),
  )
  const clamped = carryClampedToRelease(state, params, playerId, {
    reach,
    held,
    world: carved.world,
    gates: request.gates,
  })
  return withReach(carved, { reach: clamped, held }, cells)
}

/** How far the tick's work and carry reach along the sweep (`vehicle/carryWalk.ts`). */
function reachOfWork(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { sweep, request }: SweepRequest,
  walk: CarryWalk,
): CarryReach {
  const purse = carryPurseOf(state, playerId, sweep)
  const path = { path: sweep.path, pose: sweep.step.pose, world: request.world }
  const carrySweep = carrySweepOf(state, params, playerId, path)
  return walk(carrySweep, purse, releasingCarryGround(params, request, sweep))
}

/** The walk's reach, and the cell its carry kept out of the stamp (null once released). */
interface HeldReach {
  reach: CarryReach
  held: TilePoint | null
}

/**
 * The carve with the walk's reach and carry, its paid cells and then a released cell yielding
 * first, in walk order.
 */
function withReach(carved: DrillCarve, { reach, held }: HeldReach, cells: number): SweptCarve {
  return {
    ...carved,
    yielded: yieldedInWalkOrder(carved.yielded, crossedInWalkOrder(reach, held)),
    reachedStep: reach.reachedStep,
    cells,
    carrySubSteps: reach.carrySubSteps,
    paid: reach.paid,
    paidPrices: reach.paidPrices,
    carryTarget: reach.target,
  }
}

function emptyCarveOf(world: WorldState, carrySubSteps: number): SweptCarve {
  return {
    world,
    changes: [],
    yielded: [],
    ticksUsed: 0,
    casingCleared: { samples: 0, grade: 0 },
    lawWork: 0,
    gearQuanta: 0,
    gearTicksUsed: 0,
    lawWorkBp: 0,
    gearCells: [],
    aheadLatch: null,
    sideLatch: null,
    reachedStep: -1,
    cells: 0,
    carrySubSteps,
    paid: [],
    paidPrices: [],
    carryTarget: null,
  }
}

/** A sweep whose work reaches `clear`, and the cells that sweep touches. */
export interface ClearSweep extends SweepRequest {
  /** The furthest sub-step the work reaches. */
  clear: number
  /** Its stamp's and gear's cells, counted no further than one past the share. */
  cells: number
}

/** The drill bit reaching sub-step `reached` of the sweep. */
function bitAt({ step, path, stamp }: Sweep, reached: number): DrillBit {
  return { pose: step.pose, disc: sweptStampOf(path, stamp, reached), drive: step.drive }
}
