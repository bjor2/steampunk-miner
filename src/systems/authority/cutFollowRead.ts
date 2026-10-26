/**
 * What the cut-follow reads (TD scope 0 on #316, ticket 333), from the world before a tick's cut:
 *
 * - the cut gate (`vehicle/cutGate.ts`) on the uncut share of the leading slab
 *   (`vehicle/leadingSlab.ts`) of the swept stamp at the step's position;
 * - while it is open, `vCut`: the drill law's speed through the slowest uncut cell of that slab
 *   (read on idle ticks too, so a rig that lets go of the drive brakes from it),
 *   `floor(1000 * Q / nLead)` mm a tick with `nLead` its sub-step drill time as the swept cut
 *   counts it (heat, gates and shocks included), cells it may not cut left out (ticket 570: the cut
 *   rides its front up to such a cell, and the body with it). A slab with nothing left to cut
 *   leaves travel to set the speed, and says so (`isSlabClear`), so a motor mid-cut may keep its
 *   last `vCut` instead (ticket 430); one with no uncut cell the drill may cut gives 0, so the body
 *   waits; a sideways cut, and its front, never pass the drive's top speed (Bjor's ruling on #723,
 *   `vehicle/cutCapSpeed.ts`), while a cut down or up keeps the drill's alone, a cut down's front
 *   gaining it no faster than local gravity lets the body (Bjor's ruling on #724);
 * - while it is shut, whether the slab the drill bites holds such a cell (`isSpanStopped`), so a
 *   body coasting on its last `vCut` stops at once there (ticket 430).
 *
 * The pose is the last reported one moved to the step's position and turned to its facing, as
 * `drillStep` cuts it (ticket 506). The
 * authority keeps `cutGateAt` on the cursor in each `drillStep`; the client reads `cutFollowAt`
 * from the same state, with the same position and drive, before it sends that step, so the
 * client's gate is the authority's on every tick. A tick with no step counts as one under the off
 * line on both sides.
 */
import { STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { cappedCutSpeedOf, cappedCutStepMmOf, driveSpeedOf } from '../vehicle/cutCapSpeed'
import { metresPerSecondOfStep, cutStepMmOf } from '../vehicle/cutSpeed'
import {
  CLOSED_CUT_GATE,
  idledCutGate,
  isCutGateOpen,
  nextCutGate,
  type CutGate,
} from '../vehicle/cutGate'
import { stepReachStampOf, sweptDrillStampOf } from '../vehicle/drillStamp'
import { leadingSlabOf, slabOfStep, type LeadingSlab } from '../vehicle/leadingSlab'
import type { SweptCut } from '../vehicle/sweptCut'
import { aimOfPose, aimVectorOfPose, type Aim } from '../vehicle/aim'
import { steppedPoseOf, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import { groundReaderOf } from '../world/groundReader'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { widthLevelOf } from '../registries/boreWidth'
import { vehicleOf, type AuthorityState } from './authorityState'
import { gravityRampedFrontStepMmAt } from './downCutFront'
import { gatedCellTimeReader, lawStepMmOf } from './lineCutStep'
import { planetParamsOf } from './planetOfState'
import { drillQuantumAt, travelStampAheadMmAt, stepBoundsAt } from './stepBoundRead'

/**
 * A tick's step as the client sends it: its position in mm, the head's settled facing, its lift,
 * whether the drill bit.
 */
export interface CutFollowStep {
  x: number
  y: number
  facing: Facing
  /** The head's settled aim where it is off the four facings (ticket 791). */
  aim?: Aim
  isLifting: boolean
  /** The drill is engaged, so a `drillStep` goes out this tick; otherwise the tick idles. */
  isDrilling: boolean
}

export interface CutFollow {
  gate: CutGate
  /** m/s along the facing while the gate is open (0 while it is closed). */
  cutSpeed: number
  /** Open, with nothing left to cut in the slab: `cutSpeed` is travel's (ticket 430). */
  isSlabClear?: true
  /** Shut, with a cell in the bitten slab the drill may not cut: a span stop (ticket 430). */
  isSpanStopped?: true
}

/** The slab a step drives into, with what reading its cells needs and the aim it cuts along. */
interface SlabRead {
  params: PlanetParams
  pose: VehiclePose
  slab: LeadingSlab
  aim: Aim
}

/** A pose's step as the cut-follow reads it: its position, facing and aim, lift and bite. */
export function cutFollowStepOfPose(
  pose: VehiclePose,
  isLifting: boolean,
  isDrilling: boolean,
): CutFollowStep {
  const step = { x: pose.x, y: pose.y, facing: pose.facing, isLifting, isDrilling }
  return pose.aim === undefined ? step : { ...step, aim: pose.aim }
}

export function cutFollowAt(
  state: AuthorityState,
  playerId: string,
  step: CutFollowStep,
): CutFollow {
  const read = slabReadOf(state, playerId, step)
  const gate = gateAfter(state, playerId, step.isDrilling ? read : null)
  if (read === null) return { gate, cutSpeed: 0 }
  if (!isCutGateOpen(gate)) return shutFollowOf(state, playerId, read, gate, step.isDrilling)
  return openFollowOf(state, playerId, read, gate)
}

/** The gate a `drillStep` at `step` leaves on the cursor. */
export function cutGateAt(state: AuthorityState, playerId: string, step: CutFollowStep): CutGate {
  return gateAfter(state, playerId, step.isDrilling ? slabReadOf(state, playerId, step) : null)
}

function slabReadOf(state: AuthorityState, playerId: string, step: CutFollowStep): SlabRead | null {
  const params = planetParamsOf(state.planet)
  const reported = vehicleOf(state, playerId).pose
  if (params === null || reported === null) return null
  const pose = steppedPoseOf(reported, step)
  const aheadMm = travelStampAheadMmAt(state, playerId, aimOfPose(pose))
  const reader = groundReaderOf(state.world, params)
  const widthLevel = widthLevelOf(state, playerId)
  const facing = aimVectorOfPose(pose)
  const aimWith = (stamp: DiscStamp) => ({ centreMm: pose, facing, stamp, widthLevel })
  const front = sweptDrillStampOf(pose, step.isLifting, aheadMm, widthLevel)
  const reach = stepReachStampOf(pose, step.isLifting, aheadMm, widthLevel)
  const slab = slabOfStep(
    leadingSlabOf(reader, aimWith(front)),
    leadingSlabOf(reader, aimWith(reach)),
  )
  return { params, pose, slab, aim: aimOfPose(pose) }
}

/**
 * The step the swept cut's front takes this tick, mm along the facing (ticket 570, TD shape on
 * #570 point 1 and the Vertical Scaler's condition 1): the drill law's step through the slowest
 * uncut cell of the leading slab it can cut, the `vCut` the body follows, never past the cutting
 * bound; the bound itself over a slab with nothing left to cut; 0 when it can cut none there. A
 * cell it cannot cut stops the walk where the front meets it. Sideways, never past the drive's top
 * speed either (ticket 723). It reads the drill and the engine, never the body's speed, so physics
 * jitter cannot shrink the front; only a cut down reads the body's last step, as gravity holds the
 * body's gain of speed there and the front may lead it by one tick of that gain (#724,
 * `downCutFront.ts`).
 */
export function frontStepMmAt(
  state: AuthorityState,
  playerId: string,
  step: CutFollowStep,
): number {
  const read = slabReadOf(state, playerId, step)
  if (read === null) return 0
  const cappedMm = cappedCutStepMmOf(
    read.aim,
    uncappedFrontStepMmOf(state, playerId, read),
    driveSpeedOf(vehicleOf(state, playerId)),
  )
  return gravityRampedFrontStepMmAt(state, playerId, read.params, step, cappedMm)
}

/** The front's step the drill alone allows, before the drive's sideways cap. */
function uncappedFrontStepMmOf(state: AuthorityState, playerId: string, read: SlabRead): number {
  const { cuttingMm } = stepBoundsAt(state, playerId)
  if (isSlabClear(read.slab)) return cuttingMm
  return Math.min(cuttingMm, cutStepThroughSlabMmOf(state, playerId, read))
}

/** The cursor's gate idled to this tick, then this tick's slab, or one more idle tick. */
function gateAfter(state: AuthorityState, playerId: string, read: SlabRead | null): CutGate {
  const cursor = vehicleOf(state, playerId).sweptCut
  const idled = idledCutGate(cursor ?? CLOSED_CUT_GATE, idleTicksBefore(cursor, state.tick))
  return read === null ? idledCutGate(idled, 1) : nextCutGate(idled, read.slab.uncutBp)
}

/** The ticks since the cursor's step with no step of their own, before `tick`. */
function idleTicksBefore(cursor: SweptCut | undefined, tick: number): number {
  return cursor === undefined ? 0 : Math.max(0, tick - cursor.tick - 1)
}

/**
 * Open: `vCut`, held to the drive's speed sideways, or over a slab with nothing left to cut, saying
 * so, the speed `clearSlabSpeedOf` gives.
 */
function openFollowOf(
  state: AuthorityState,
  playerId: string,
  read: SlabRead,
  gate: CutGate,
): CutFollow {
  const driveSpeed = driveSpeedOf(vehicleOf(state, playerId))
  if (isSlabClear(read.slab)) {
    return {
      gate,
      cutSpeed: clearSlabSpeedOf(state, playerId, read, driveSpeed),
      isSlabClear: true,
    }
  }
  const cutSpeed = cappedCutSpeedOf(read.aim, cutSpeedOf(state, playerId, read), driveSpeed)
  return { gate, cutSpeed }
}

/**
 * Over a cleared slab: the drive's speed sideways (ticket 723); along a cut down or up, the drill's
 * cut through the nominal ground where that is faster, so a cut breaking into open ground keeps
 * the drill's pace there, never the drive's.
 */
function clearSlabSpeedOf(
  state: AuthorityState,
  playerId: string,
  read: SlabRead,
  driveSpeed: number,
): number {
  const nominalCutMm = stepBoundsAt(state, playerId).cuttingMm - STEP_BOUND_TOLERANCE_MM
  const drillSpeed = Math.max(driveSpeed, metresPerSecondOfStep(nominalCutMm))
  return cappedCutSpeedOf(read.aim, drillSpeed, driveSpeed)
}

/** Shut: no speed, and whether a span stop stands in the slab the drill bites. */
function shutFollowOf(
  state: AuthorityState,
  playerId: string,
  read: SlabRead,
  gate: CutGate,
  isDrilling: boolean,
): CutFollow {
  if (!isDrilling || !isSpanStoppedAt(state, playerId, read)) return { gate, cutSpeed: 0 }
  return { gate, cutSpeed: 0, isSpanStopped: true }
}

function isSlabClear(slab: LeadingSlab): boolean {
  return slab.uncutTiles.length === 0
}

/** The slab holds an uncut cell the drill may not cut. */
function isSpanStoppedAt(state: AuthorityState, playerId: string, read: SlabRead): boolean {
  if (isSlabClear(read.slab)) return false
  return slowestSubStepsOf(state, playerId, read.params, read.slab.uncutTiles) === null
}

/**
 * `vCut` in m/s through the slab's uncut cells the drill can cut, in the rig's quantum; 0 when it
 * can cut none. A cell it cannot cut stops the cut's walk where the front meets it (ticket 570),
 * so the body drives on up to its face instead of waiting a slab short of it.
 */
function cutSpeedOf(state: AuthorityState, playerId: string, read: SlabRead): number {
  return metresPerSecondOfStep(cutStepThroughSlabMmOf(state, playerId, read))
}

/**
 * The drill law's step through the slab's slowest uncut cell the drill can cut, or past a cell a
 * tick along the front's line (ticket 733, `lineCutStep.ts`); 0 when it can cut none.
 */
function cutStepThroughSlabMmOf(state: AuthorityState, playerId: string, read: SlabRead): number {
  const leadSubSteps = slowestCuttableSubStepsOf(state, playerId, read.params, read.slab.uncutTiles)
  if (leadSubSteps === null) return 0
  const leadStepMm = cutStepMmOf(leadSubSteps, drillQuantumAt(state, playerId))
  return lawStepMmOf(state, playerId, read, leadStepMm)
}

/** The cells' sub-step drill times as the drill's gates answer them: null for one it cannot cut. */
function cellSubStepsOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tiles: readonly TilePoint[],
): (number | null)[] {
  return tiles.map(gatedCellTimeReader(state, playerId, params))
}

/** `nLead`: the largest sub-step drill time of the cells, or null when one cannot be cut. */
function slowestSubStepsOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tiles: readonly TilePoint[],
): number | null {
  const times = cellSubStepsOf(state, playerId, params, tiles)
  return times.includes(null) ? null : Math.max(0, ...(times as number[]))
}

/** The largest sub-step drill time of the cells the drill can cut, or null when it can cut none. */
function slowestCuttableSubStepsOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tiles: readonly TilePoint[],
): number | null {
  const times = cellSubStepsOf(state, playerId, params, tiles).filter((time) => time !== null)
  return times.length === 0 ? null : Math.max(...times)
}
