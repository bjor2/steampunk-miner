/**
 * What the drill does at a step's pose, for the vehicle's motor (`vehicleController.ts`): whether
 * it bites (#7, #36) and, with the swept cut on, whether the drill sets the speed along the
 * facing (ticket 333). Pure reads of the ground and the authority, no Rapier.
 */
import type { CutFollow, CutFollowStep } from '../systems/authority/cutFollowRead'
import type { CutFollowMotion } from '../systems/vehicle/cutFollowMotion'
import { isCutGateOpen } from '../systems/vehicle/cutGate'
import {
  drillContactOf,
  type DrillContact,
  type DrillContactRule,
} from '../systems/vehicle/drillContact'
import { isHeadSettled, type DrillHead } from '../systems/vehicle/drillHead'
import { drillStampOf } from '../systems/vehicle/drillStamp'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'

/** The parts of a step's input the drill reads. */
export interface DrillEngagementInput {
  intent: VehicleIntent
  canAct: boolean
  drillContactRule?: DrillContactRule
  cutFollowOf?: (step: CutFollowStep) => CutFollow
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
  return contactOf(ground, { centreMm: pose, facing, stamp: drillStampOf(pose, isLifting) })
}

/**
 * The cut-follow while the cut gate is open at this step's pose (ticket 333): the drill's speed
 * along the head's facing, pushed while the held aim matches it. Nothing with the swept cut off.
 */
export function cutFollowFor(
  input: DrillEngagementInput,
  { pose, isLifting }: DrillPose,
  isDrilling: boolean,
): CutFollowMotion | undefined {
  if (input.cutFollowOf === undefined || !input.canAct) return undefined
  const read = input.cutFollowOf({ x: pose.x, y: pose.y, isLifting, isDrilling })
  if (!isCutGateOpen(read.gate)) return undefined
  return {
    speed: read.cutSpeed,
    facing: pose.facing,
    isPushing: input.intent.facing === pose.facing,
  }
}
