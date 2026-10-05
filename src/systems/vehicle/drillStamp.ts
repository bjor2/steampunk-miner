/**
 * The drill's stamp at a reported pose (decisions #36, #40): a disc of `DRILL_STAMP_RADIUS_MM`
 * centred ahead of the body along its facing in the local frame. Integer millimetres from the
 * integer pose, so the authority and a predicting guest carve the same disc.
 *
 * Driving sideways on the ground (head left or right, no lift) the disc is raised by
 * `DRILL_STAMP_LIFT_MM` and given a level floor (`stampShape`) at the wheels' distance from the
 * planet's centre, rounded down to whole samples. A disc that only followed the body would let the
 * tunnel floor creep up or down a little every metre, with nothing to pull it back; the level
 * floor's contour lies exactly on its circle, so the body comes to rest on it, measures the same
 * rounded radius next time, and the tunnel runs level along the planet's curve. Bobbing by less
 * than half a sample changes nothing. With the lift on (`W` + `D`, #40) the whole disc follows the path, so climbing while
 * drilling still cuts a smooth diagonal.
 */
import {
  DRILL_STAMP_AHEAD_MM,
  DRILL_STAMP_LIFT_MM,
  DRILL_STAMP_RADIUS_MM,
} from '../../constants/balance'
import { UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import type { DiscStamp } from '../world/stampShape'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { FACING, facingVectorOf, type VehiclePose } from './vehiclePose'

const HALF_BODY_MM = (VEHICLE_COLLIDER_SIZE * 1000) / 2
/** Contacts let a resting body sink a few mm into its floor; that must not drop the floor. */
const FLOOR_JITTER_MM = 20

export function drillStampOf(pose: VehiclePose, isLifting: boolean): DiscStamp {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const isLevelCut = isSideways(pose) && !isLifting
  const lift = isLevelCut ? DRILL_STAMP_LIFT_MM : 0
  return {
    xMm: pose.x + scaled(ahead.x, DRILL_STAMP_AHEAD_MM) + scaled(pose.upx, lift),
    yMm: pose.y + scaled(ahead.y, DRILL_STAMP_AHEAD_MM) + scaled(pose.upy, lift),
    radiusMm: DRILL_STAMP_RADIUS_MM,
    floorRadiusMm: isLevelCut ? wheelFloorRadiusOf(pose) : null,
  }
}

function isSideways(pose: VehiclePose): boolean {
  return pose.facing === FACING.left || pose.facing === FACING.right
}

/**
 * The wheels' distance from the planet's centre rounded down to whole samples, in mm, after
 * allowing `FLOOR_JITTER_MM` for a body resting a hair into its floor: never meaningfully above
 * the wheels, so the floor never leaves a lip the drill may not cut.
 */
function wheelFloorRadiusOf(pose: VehiclePose): number {
  const wheels = Math.floor(Math.sqrt(pose.x * pose.x + pose.y * pose.y)) - HALF_BODY_MM
  return Math.floor((wheels + FLOOR_JITTER_MM) / MM_PER_SAMPLE) * MM_PER_SAMPLE
}

/** A component of a 1024-scaled unit vector, times a length in mm, in whole mm. */
function scaled(component: number, lengthMm: number): number {
  return Math.floor((component * lengthMm) / UP_VECTOR_SCALE)
}
