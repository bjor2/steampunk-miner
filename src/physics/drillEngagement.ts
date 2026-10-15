/**
 * What the drill does at a step's pose, for the vehicle's motor (`vehicleController.ts`): whether
 * it bites (#7, #36) and, with the swept cut on, whether the drill sets the speed along the
 * facing (ticket 333) and whether the wheels wait for it (ticket 400). With the swept cut on, the rig's
 * step bounds (ticket 334) widen the wait-for-cut window and pick the speed the body is clamped to. Pure reads of the ground and the authority, no
 * Rapier.
 */
import { DRILL_STAMP_AHEAD_MM } from '../constants/balance'
import type { CutFollow, CutFollowStep } from '../systems/authority/cutFollowRead'
import type { CutFollowMotion } from '../systems/vehicle/cutFollowMotion'
import { isCutGateOpen } from '../systems/vehicle/cutGate'
import {
  drillContactOf,
  inTheWayMmOf,
  type DrillContact,
  type DrillContactRule,
} from '../systems/vehicle/drillContact'
import { isHeadSettled, type DrillHead } from '../systems/vehicle/drillHead'
import {
  clearedSlabSpeedOf,
  heldCutOf,
  type CutMemory,
  type CutTick,
} from '../systems/vehicle/heldCut'
import { drillStampOf, sweptDrillStampOf } from '../systems/vehicle/drillStamp'
import { speedOfStepBound, stepBoundMmOf, type StepBounds } from '../systems/vehicle/stepBound'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'
import type { DiscStamp } from '../systems/world/stampShape'

/** The parts of a step's input the drill reads. */
export interface DrillEngagementInput {
  intent: VehicleIntent
  canAct: boolean
  drillContactRule?: DrillContactRule
  cutFollowOf?: (step: CutFollowStep) => CutFollow
  stepBounds?: StepBounds
}

/** The step's pose and whether its lift is on. */
export interface DrillPose {
  pose: VehiclePose
  isLifting: boolean
}

/**
 * Drilling auto-engages when the player pushes into ground the settled head faces (#7): the held
 * aim matches the facing and the drill's stamp has ground to cut (#36, `drillContact`).
 * `followedTicks` is the cut-follow's count (ticket 400): a cut under way bites on the stamp its
 * `drillStep` cuts (`bitingStampOf`).
 */
export function drillContactFor(
  input: DrillEngagementInput,
  head: DrillHead,
  { pose, isLifting }: DrillPose,
  ground: GroundReader,
  followedTicks: number,
): DrillContact {
  if (input.intent.facing !== pose.facing || !isHeadSettled(head)) return 'none'
  return contactOf(input, pose, ground, bitingStampOf(input, pose, isLifting, followedTicks))
}

/**
 * The stamp the drill bites with. A swept cut under way (ticket 397) bites on the stamp its
 * `drillStep` cuts, ahead by the step the rig may take while it cuts: a cut faster than a cell a
 * tick has already cleared the report's short stamp, and a tick it stopped biting would send no
 * step and lose that tick's work. A cut starts on the report's stamp, at the face, and with the
 * swept cut off (no step bounds) the report's stamp is the only one.
 */
function bitingStampOf(
  input: DrillEngagementInput,
  pose: VehiclePose,
  isLifting: boolean,
  followedTicks: number,
): DiscStamp {
  if (input.stepBounds === undefined || followedTicks === 0) return drillStampOf(pose, isLifting)
  return sweptDrillStampOf(pose, isLifting, DRILL_STAMP_AHEAD_MM + input.stepBounds.cuttingMm)
}

/** What the report's stamp meets along the pose's facing, whatever the drive does. */
function facedContactOf(
  input: DrillEngagementInput,
  { pose, isLifting }: DrillPose,
  ground: GroundReader,
): DrillContact {
  return contactOf(input, pose, ground, drillStampOf(pose, isLifting))
}

/** What `stamp` meets along the pose's facing. */
function contactOf(
  input: DrillEngagementInput,
  pose: VehiclePose,
  ground: GroundReader,
  stamp: DiscStamp,
): DrillContact {
  const contactRule = input.drillContactRule ?? drillContactOf
  return contactRule(ground, {
    centreMm: pose,
    facing: facingVectorOf(pose.upx, pose.upy, pose.facing),
    stamp,
    inTheWayMm: input.stepBounds && inTheWayMmOf(input.stepBounds.cuttingMm),
  })
}

/**
 * A let-go cut whose stop ramp has reached uncut ground in the body's way stops there at once
 * (ticket 430): with the drive let go the drill no longer cuts, and a fast rig's ramp would carry
 * the body past the paid face into rock, to bounce off it. Any other cut as it is.
 */
function stoppedAtFaceFor(
  input: DrillEngagementInput,
  drillPose: DrillPose,
  ground: GroundReader,
  cut: CutFollowMotion | undefined,
): CutFollowMotion | undefined {
  if (cut === undefined || cut.isPushing) return cut
  if (facedContactOf(input, drillPose, ground) !== 'inTheWay') return cut
  return { ...cut, isAtFace: true }
}

/**
 * The cut gate and the drill's speed at this step's pose, read before the step's cut (ticket 333),
 * whether or not the rig can act: the step bound reads the gate too. Nothing with the swept cut off.
 */
export function cutFollowReadFor(
  input: DrillEngagementInput,
  { pose, isLifting }: DrillPose,
  isDrilling: boolean,
): CutFollow | undefined {
  return input.cutFollowOf?.({ x: pose.x, y: pose.y, isLifting, isDrilling })
}

/** What a step's cut-follow starts from: the read, the carried memory and what the drill meets. */
export interface CutFollowStart {
  read: CutFollow | undefined
  memory: CutMemory
  contact: DrillContact
  isCuttingLevel: boolean
}

/**
 * The cut that sets the speed this step (tickets 333, 400, 430): the open gate's, else one held
 * through the shut gate, stopped at once at the face once let go; with whether the gate is open
 * and whether the wheels wait for the drill.
 */
export function cutTickFor(
  input: DrillEngagementInput,
  drillPose: DrillPose,
  start: CutFollowStart,
  ground: GroundReader,
): CutTick {
  const { read, memory, contact, isCuttingLevel } = start
  const isDrilling = contact !== 'none'
  const openCut = cutFollowFor(input, drillPose.pose, read, memory, isDrilling)
  const isWaitingForCut = isWaitingForCutAt(isCuttingLevel, contact, openCut)
  const bite = { isDrilling, isWaitingForCut }
  const drillCut = openCut ?? heldCutFor(input, drillPose.pose, read, memory, bite)
  return {
    cut: stoppedAtFaceFor(input, drillPose, ground, drillCut),
    isGateOpen: openCut !== undefined,
    isWaitingForCut,
  }
}

/** What the drill did this step besides the gate: whether it bites, whether the wheels wait. */
interface DrillBite {
  isDrilling: boolean
  isWaitingForCut: boolean
}

/**
 * The cut-follow while the cut gate is open at this step's pose (ticket 333): the drill's speed
 * along the head's facing, pushed while the held aim matches it. Over a slab the cut has just
 * cleared, while the drill still bites, the last `vCut` followed rather than travel's (ticket 430).
 * Nothing with the swept cut off.
 */
function cutFollowFor(
  input: DrillEngagementInput,
  pose: VehiclePose,
  read: CutFollow | undefined,
  memory: CutMemory,
  isDrilling: boolean,
): CutFollowMotion | undefined {
  if (read === undefined || !input.canAct || !isCutGateOpen(read.gate)) return undefined
  const cut = {
    speed: openCutSpeedOf(read, memory, pose, isDrilling),
    facing: pose.facing,
    isPushing: input.intent.facing === pose.facing,
    followedTicks: memory.followedTicks,
  }
  return cut.isPushing ? cut : { ...cut, releasedTicks: memory.releasedTicks }
}

function openCutSpeedOf(
  read: CutFollow,
  memory: CutMemory,
  pose: VehiclePose,
  isDrilling: boolean,
): number {
  if (!read.isSlabClear || !isDrilling) return read.cutSpeed
  return clearedSlabSpeedOf(memory, pose.facing) ?? read.cutSpeed
}

/**
 * The cut the motor follows while the cut gate is shut (ticket 430, `heldCut.ts`): a coast on the
 * last `vCut` while the drive pushes and the drill bites with no span stop, or the stop ramp the
 * drive's letting go began. Nothing with the swept cut off, or a rig that cannot act.
 */
function heldCutFor(
  input: DrillEngagementInput,
  pose: VehiclePose,
  read: CutFollow | undefined,
  memory: CutMemory,
  bite: DrillBite,
): CutFollowMotion | undefined {
  if (read === undefined || !input.canAct) return undefined
  return heldCutOf(memory, {
    facing: pose.facing,
    isPushing: input.intent.facing === pose.facing,
    canCoast: canCoastOn(read, bite),
  })
}

/** The drill bites with the wheels free and no span stop in its slab. */
function canCoastOn(read: CutFollow, bite: DrillBite): boolean {
  return bite.isDrilling && !bite.isWaitingForCut && read.isSpanStopped !== true
}

/**
 * Whether the wheels wait for the drill in a level cut. With the drill setting the speed only a
 * real span stop holds them (ticket 400, TD lock on #397 point 3): a lead cell the drill may not
 * cut, which the read gives as a `vCut` of 0. Otherwise ground in the body's way does.
 */
export function isWaitingForCutAt(
  isCuttingLevel: boolean,
  contact: DrillContact,
  cutFollow: CutFollowMotion | undefined,
): boolean {
  if (!isCuttingLevel) return false
  return cutFollow === undefined ? contact === 'inTheWay' : cutFollow.speed === 0
}

/**
 * The speed the body is clamped to (ticket 334): the rig's step bound for the cut gate it reads,
 * as m/s; undefined with the swept cut off, so the motion rule keeps its 18 m/s.
 */
export function maxSpeedFor(
  input: DrillEngagementInput,
  read: CutFollow | undefined,
): number | undefined {
  if (input.stepBounds === undefined) return undefined
  const isCutting = read !== undefined && isCutGateOpen(read.gate)
  return speedOfStepBound(stepBoundMmOf(input.stepBounds, isCutting))
}
