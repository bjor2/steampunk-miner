/**
 * Where the drill head is drawn (#7 "Facing", #13: the head shows 4 facing states and swivels;
 * any aim since ticket 791, the #308 drill-head art turning with it): on a circle round the body's
 * centre, at the angle of its aim in the body's frame. While it
 * turns it sweeps the short way from the old facing to the new one over the same `SWIVEL_TICKS`
 * the logic uses, so what the eye sees and what the drill bites never disagree for long.
 * Written into a scratch pose, because it runs every frame (CLAUDE.md frame rules).
 */
import { AIM_STEPS_PER_TURN } from '../../constants/physics'
import { aimTurnOf, AIM, type Aim } from '../vehicle/aim'
import { swivelProgressOf, type DrillHead } from '../vehicle/drillHead'

export interface DrillHeadPose {
  x: number
  y: number
  /** Radians counter-clockwise from the body's right. */
  angle: number
}

/** Radians an aim step turns. */
const RADIANS_PER_AIM_STEP = (2 * Math.PI) / AIM_STEPS_PER_TURN

export function createDrillHeadPose(): DrillHeadPose {
  return { x: 0, y: 0, angle: 0 }
}

/** `reach` is metres from the body's centre to the head's centre. */
export function writeDrillHeadPose(head: DrillHead, reach: number, pose: DrillHeadPose): void {
  pose.angle = sweptAngleOf(head)
  pose.x = Math.cos(pose.angle) * reach
  pose.y = Math.sin(pose.angle) * reach
}

function sweptAngleOf(head: DrillHead): number {
  const from = angleOfAim(head.from)
  return from + shortTurnOf(from, angleOfAim(head.to)) * swivelProgressOf(head)
}

/** Right 0, up a quarter turn, left a half, down a quarter clockwise, as the facings drew. */
function angleOfAim(aim: Aim): number {
  return aimTurnOf(AIM.right, aim) * RADIANS_PER_AIM_STEP
}

/** The signed turn from `from` to `to`, at most half a circle; a half turn goes counter-clockwise. */
function shortTurnOf(from: number, to: number): number {
  const turn = (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return turn > Math.PI ? turn - 2 * Math.PI : turn
}
