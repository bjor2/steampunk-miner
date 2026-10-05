/**
 * Where the drill head is drawn (#7 "Facing", #13: the head shows 4 facing states and swivels):
 * on a circle round the body's centre, at the angle of its facing in the body's frame. While it
 * turns it sweeps the short way from the old facing to the new one over the same `SWIVEL_TICKS`
 * the logic uses, so what the eye sees and what the drill bites never disagree for long.
 * Written into a scratch pose, because it runs every frame (CLAUDE.md frame rules).
 */
import { swivelProgressOf, type DrillHead } from '../vehicle/drillHead'
import { FACING, type Facing } from '../vehicle/vehiclePose'

export interface DrillHeadPose {
  x: number
  y: number
  /** Radians counter-clockwise from the body's right. */
  angle: number
}

const ANGLE_OF_FACING: Readonly<Record<Facing, number>> = {
  [FACING.right]: 0,
  [FACING.up]: Math.PI / 2,
  [FACING.left]: Math.PI,
  [FACING.down]: -Math.PI / 2,
}

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
  const from = ANGLE_OF_FACING[head.from]
  return from + shortTurnOf(from, ANGLE_OF_FACING[head.to]) * swivelProgressOf(head)
}

/** The signed turn from `from` to `to`, at most half a circle; a half turn goes counter-clockwise. */
function shortTurnOf(from: number, to: number): number {
  const turn = (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return turn > Math.PI ? turn - 2 * Math.PI : turn
}
