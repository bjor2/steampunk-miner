/**
 * The drill's stamp at a reported pose (decisions #36, #40): a disc of the bore's radius
 * (`drillBore.ts`, the body's width plus the side clearance) centred ahead of the body along its
 * facing in the local frame. Integer millimetres from the
 * integer pose, so the authority and a predicting guest carve the same disc.
 *
 * Driving sideways on the ground (head left or right, no lift) the disc is raised by the bore's
 * lift (`drillStampLiftMm`) and given a level floor (`stampShape`) at the wheels' distance from the
 * planet's centre, rounded down to whole samples. A disc that only followed the body would let the
 * tunnel floor creep up or down a little every metre, with nothing to pull it back; the level
 * floor's contour lies exactly on its circle, so the body comes to rest on it, measures the same
 * rounded radius next time, and the tunnel runs level along the planet's curve. Bobbing by less
 * than half a sample changes nothing. With the lift on (`W` + `D`, #40) the whole disc follows the path, so climbing while
 * drilling still cuts a smooth diagonal.
 *
 * The swept cut's stamp (ticket 333) is the same disc centred on the cut's front (ticket 570,
 * `sweptStampAheadMmOf`): where the body's face will be after the tick's step, plus the contact
 * margin and the half sample the front's ramp leaves behind it (`world/cutFront.ts`), so the face
 * it cuts is where the body lands. Its reach is the step, never the step bound.
 *
 * A report whose bite runs on from its previous pose (ticket 537) cuts its stamp as the capsule
 * from that pose's stamp centre, the tail (`authority/reportedCapsule.ts` picks it).
 */
import {
  BODY_HALF_SIZE_MM,
  CUT_FACE_MARGIN_MM,
  DRILL_STAMP_OFFSET_MM,
} from '../../constants/balance'
import { TICKS_PER_SECOND, UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { centreDistanceFloorMmOf } from '../world/exactSquares'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { drillStampLiftMm, drillStampRadiusMm } from './drillBore'
import { FACING, facingVectorOf, type VehiclePose } from './vehiclePose'

const HALF_BODY_MM = (VEHICLE_COLLIDER_SIZE * 1000) / 2
/** Contacts let a resting body sink a few mm into its floor; that must not drop the floor. */
const FLOOR_JITTER_MM = 20
/**
 * The same allowance for a cut riding its face (ticket 570). The floor's ramp spans half a sample
 * either side of its circle, so its contour, read between samples on a grid the circle crosses at
 * a slant, lies up to 21 mm above or below the circle as the body moves along it; a body pressed
 * along that floor by its cut sank past 20 mm every few metres and stepped the floor down a
 * sample. 35 mm covers the 21 and the contact's few. Travel keeps 20 (its stamp runs ahead, and
 * the specs that drive along the surface read its ground).
 */
const CUTTING_FLOOR_JITTER_MM = 35

export function drillStampOf(pose: VehiclePose, isLifting: boolean): DiscStamp {
  return stampAheadBy(pose, isLifting, DRILL_STAMP_OFFSET_MM)
}

/**
 * How far ahead of the pose the swept stamp's centre sits for a tick whose step is `stepMm` along
 * the facing (ticket 570): the body's face after that step, the contact margin, and the half
 * sample between the front and the face it leaves. The authority's cut and the client's bite both
 * read it, so they never disagree on where the stamp is.
 */
export function sweptStampAheadMmOf(stepMm: number): number {
  return BODY_HALF_SIZE_MM + stepMm + CUT_FACE_MARGIN_MM + MM_PER_SAMPLE / 2
}

/**
 * The step a cutting tick's front takes (ticket 570): the drill law's step (`lawStepMm`), never the
 * body's speed, so physics jitter cannot shrink it, and never past the cutting bound.
 */
export function cutFrontStepMmOf(lawStepMm: number, cuttingMm: number): number {
  return Math.min(cuttingMm, lawStepMm)
}

/**
 * The front's step on the first cutting tick after travel (a body landing on the face from a fall
 * or a drive): the law's step, or the body's own speed along the facing as the pose reports it
 * when that is more, so the face it lands on is cut where the body gets to; never past the bound.
 * The walk's work still decides how far rock is cut, and the cut-follow brings the body to `vCut`.
 */
export function landingFrontStepMmOf(
  pose: VehiclePose,
  lawStepMm: number,
  cuttingMm: number,
): number {
  return cutFrontStepMmOf(Math.max(lawStepMm, bodyStepAlongFacingMm(pose)), cuttingMm)
}

/** The pose's speed along its facing, as whole mm a fixed step. */
function bodyStepAlongFacingMm(pose: VehiclePose): number {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const alongMmPerSecond = Math.floor((pose.vx * ahead.x + pose.vy * ahead.y) / UP_VECTOR_SCALE)
  return Math.floor(alongMmPerSecond / TICKS_PER_SECOND)
}

/** The swept cut's stamp: the report's disc with its centre `aheadMm` ahead of the pose. */
export function sweptDrillStampOf(
  pose: VehiclePose,
  isLifting: boolean,
  aheadMm: number,
): DiscStamp {
  return stampAheadBy(pose, isLifting, aheadMm)
}

/**
 * The stamp of a cut riding its face (the gate open, ticket 570): `sweptDrillStampOf`, its level
 * floor allowing `CUTTING_FLOOR_JITTER_MM`.
 */
export function cuttingDrillStampOf(
  pose: VehiclePose,
  isLifting: boolean,
  aheadMm: number,
): DiscStamp {
  const stamp = stampAheadBy(pose, isLifting, aheadMm)
  if (stamp.floorRadiusMm === null) return stamp
  return { ...stamp, floorRadiusMm: wheelFloorRadiusOf(pose, CUTTING_FLOOR_JITTER_MM) }
}

/** The stamp as the capsule from `tail` to its centre (ticket 537), or the stamp alone with none. */
export function stampSweptFrom(stamp: DiscStamp, tail: StampPoint | null): DiscStamp {
  return tail === null ? stamp : { ...stamp, tail }
}

function stampAheadBy(pose: VehiclePose, isLifting: boolean, aheadMm: number): DiscStamp {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const isLevelCut = isSideways(pose) && !isLifting
  const lift = isLevelCut ? drillStampLiftMm() : 0
  return {
    xMm: pose.x + scaled(ahead.x, aheadMm) + scaled(pose.upx, lift),
    yMm: pose.y + scaled(ahead.y, aheadMm) + scaled(pose.upy, lift),
    radiusMm: drillStampRadiusMm(),
    floorRadiusMm: isLevelCut ? wheelFloorRadiusOf(pose, FLOOR_JITTER_MM) : null,
  }
}

function isSideways(pose: VehiclePose): boolean {
  return pose.facing === FACING.left || pose.facing === FACING.right
}

/**
 * The wheels' distance from the planet's centre rounded down to whole samples, in mm, after
 * allowing `jitterMm` for a body resting a hair into its floor: never meaningfully above the
 * wheels, so the floor never leaves a lip the drill may not cut.
 */
function wheelFloorRadiusOf(pose: VehiclePose, jitterMm: number): number {
  const wheels = centreDistanceFloorMmOf(pose.x, pose.y) - HALF_BODY_MM
  return Math.floor((wheels + jitterMm) / MM_PER_SAMPLE) * MM_PER_SAMPLE
}

/** A component of a 1024-scaled unit vector, times a length in mm, in whole mm. */
function scaled(component: number, lengthMm: number): number {
  return Math.floor((component * lengthMm) / UP_VECTOR_SCALE)
}
