/**
 * What the drill does at a step's pose, for the vehicle's motor (`vehicleController.ts`): whether
 * it bites (#7, #36) and, with the swept cut on, whether the drill sets the speed along the
 * facing (ticket 333) and whether the wheels wait for it (ticket 400). With the swept cut on, the rig's
 * step bounds (ticket 334) widen the wait-for-cut window and pick the speed the body is clamped to. Pure reads of the ground and the authority, no
 * Rapier.
 */
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
import { drillStampOf } from '../systems/vehicle/drillStamp'
import { speedOfStepBound, stepBoundMmOf, type StepBounds } from '../systems/vehicle/stepBound'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'

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
 */
export function drillContactFor(
  input: DrillEngagementInput,
  head: DrillHead,
  { pose, isLifting }: DrillPose,
  ground: GroundReader,
): DrillContact {
  if (input.intent.facing !== pose.facing || !isHeadSettled(head)) return 'none'
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const contactOf = input.drillContactRule ?? drillContactOf
  return contactOf(ground, {
    centreMm: pose,
    facing,
    stamp: drillStampOf(pose, isLifting),
    inTheWayMm: input.stepBounds && inTheWayMmOf(input.stepBounds.cuttingMm),
  })
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

/**
 * The cut-follow while the cut gate is open at this step's pose (ticket 333): the drill's speed
 * along the head's facing, pushed while the held aim matches it. Nothing with the swept cut off.
 */
export function cutFollowFor(
  input: DrillEngagementInput,
  pose: VehiclePose,
  read: CutFollow | undefined,
  followedTicks: number,
): CutFollowMotion | undefined {
  if (read === undefined || !input.canAct || !isCutGateOpen(read.gate)) return undefined
  return {
    speed: read.cutSpeed,
    facing: pose.facing,
    isPushing: input.intent.facing === pose.facing,
    followedTicks,
  }
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
