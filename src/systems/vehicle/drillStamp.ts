/**
 * The drill's stamp at a reported pose (decisions #36, #40): a disc of the bore's radius
 * (`drillBore.ts`, the body's width plus the side clearance) centred ahead of the body along its
 * facing in the local frame. Integer millimetres from the
 * integer pose, so the authority and a predicting guest carve the same disc.
 *
 * Driving sideways on the ground (head left or right, no lift) the disc is raised by the bore's
 * lift (`drillStampLiftMm`, none at the 0.15 m clearance) and given a level floor (`stampShape`) at
 * the wheels' distance from the planet's centre, rounded down to whole samples, with the floor
 * band under it across the wheels' width (`floorBand.ts`, GD lock on #662 Q2), so a floor step
 * settles in one stamp. A disc that only followed the body would let the tunnel floor creep up or
 * down a little every metre, with nothing to pull it back; the level floor's contour lies exactly
 * on its circle, so the body comes to rest on it, measures the same rounded radius next time, and
 * the tunnel runs level along the planet's curve. Bobbing by less than half a sample changes
 * nothing. With the lift on (`W` + `D`, #40) the whole disc follows the path, so climbing while
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
  DRILL_REPORT_STAMP_LENGTH_MM,
  DRILL_STAMP_OFFSET_MM,
} from '../../constants/balance'
import { TICKS_PER_SECOND, UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { centreDistanceFloorMmOf } from '../world/exactSquares'
import type { FloorBand } from '../world/floorBand'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { drillStampLiftMm, drillStampRadiusMm } from './drillBore'
import { AIM, aimDirectionOf, aimOfPose, aimVectorOfPose, isSidewaysAim, type Aim } from './aim'
import type { VehiclePose } from './vehiclePose'

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
 * What a pose report cuts (GD lock on #662): its stamp run on `DRILL_REPORT_STAMP_LENGTH_MM` along
 * the facing, the capsule from the stamp's centre to there, so the narrow bore pre-cuts the ground
 * ahead as #36's wide disc did. The stamp's own centre stays where the casing, the gear and the
 * report capsule's tail read it (`drillStampOf`).
 */
export function reportCutStampOf(pose: VehiclePose, isLifting: boolean): DiscStamp {
  const stamp = drillStampOf(pose, isLifting)
  if (stamp.floorRadiusMm !== null) return stamp
  const head = stampAheadBy(pose, isLifting, DRILL_STAMP_OFFSET_MM + DRILL_REPORT_STAMP_LENGTH_MM)
  return { ...head, tail: { xMm: stamp.xMm, yMm: stamp.yMm } }
}

/**
 * How far ahead of the pose the swept stamp's centre sits for a tick whose step is `stepMm` along
 * the aim (ticket 570): the body's face after that step, the contact margin, and the half sample
 * between the front and the face it leaves. The authority's cut and the client's bite both read
 * it, so they never disagree on where the stamp is.
 */
export function sweptStampAheadMmOf(stepMm: number, aim: Aim): number {
  return bodyFaceMmAlong(aim) + stepMm + CUT_FACE_MARGIN_MM + MM_PER_SAMPLE / 2
}

/**
 * How far the body's square reaches from its centre along an aim, whole mm rounded up: half its
 * side along one of the four facings, its corner's reach between them (ticket 791), so a diagonal
 * cut's face clears the corner that leads it instead of holding the body on it.
 */
export function bodyFaceMmAlong(aim: Aim): number {
  const { along, up } = aimDirectionOf(aim)
  return Math.ceil((BODY_HALF_SIZE_MM * (Math.abs(along) + Math.abs(up))) / UP_VECTOR_SCALE)
}

/**
 * Where the cut's front sits ahead of the centre of a body riding its face (ticket 789): the
 * swept stamp's, its step taken, so the face's contour lies half a sample behind it. The drawn
 * drill tip sits here, so the bit is drawn where the ground opens; the art draws a facing's.
 */
export function ridingCutFrontAheadMmOf(): number {
  return sweptStampAheadMmOf(0, AIM.right)
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
  const ahead = aimVectorOfPose(pose)
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
 * The ground a travelling step may drive into, as the cut gate reads it (`leadingSlab.ts`): the
 * capsule from the report's stamp to the swept stamp `aheadMm` ahead. #36's 1.9 m disc there
 * reached back to the body's face at any cutting bound up to about 1.2 m a tick; the 1.2 m bore's
 * full-weight core starts 0.75 m past the centre at 44 m/s (GD lock on #662), so the bare disc
 * read a cave below the face and never opened the gate on the rock the body stood on.
 */
export function stepReachStampOf(
  pose: VehiclePose,
  isLifting: boolean,
  aheadMm: number,
): DiscStamp {
  const stamp = drillStampOf(pose, isLifting)
  return { ...stampAheadBy(pose, isLifting, aheadMm), tail: { xMm: stamp.xMm, yMm: stamp.yMm } }
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

/**
 * What a cut riding its face bites on (GD lock on #662): the capsule from the report's stamp at
 * the face to the cutting stamp `aheadMm` ahead. #36's 1.9 m disc there reached back toward the
 * face; the 1.2 m bore's disc at a fast rig's front starts most of a metre past it, so ground just
 * past the face read as nothing to cut, no step was sent, and the body drove into it.
 */
export function cuttingReachStampOf(
  pose: VehiclePose,
  isLifting: boolean,
  aheadMm: number,
): DiscStamp {
  const face = drillStampOf(pose, isLifting)
  return {
    ...cuttingDrillStampOf(pose, isLifting, aheadMm),
    tail: { xMm: face.xMm, yMm: face.yMm },
  }
}

/** The stamp as the capsule from `tail` to its centre (ticket 537), or the stamp alone with none. */
export function stampSweptFrom(stamp: DiscStamp, tail: StampPoint | null): DiscStamp {
  return tail === null ? stamp : { ...stamp, tail }
}

function stampAheadBy(pose: VehiclePose, isLifting: boolean, aheadMm: number): DiscStamp {
  const ahead = aimVectorOfPose(pose)
  const isLevelCut = isSideways(pose) && !isLifting
  const lift = isLevelCut ? drillStampLiftMm() : 0
  return {
    xMm: pose.x + scaled(ahead.x, aheadMm) + scaled(pose.upx, lift),
    yMm: pose.y + scaled(ahead.y, aheadMm) + scaled(pose.upy, lift),
    radiusMm: drillStampRadiusMm(),
    floorRadiusMm: isLevelCut ? wheelFloorRadiusOf(pose, FLOOR_JITTER_MM) : null,
    edge: 'boreWall',
    ...(isLevelCut ? { floorBand: floorBandOf(pose) } : {}),
  }
}

/** A level cut's band under its disc, across the wheels' width (GD lock on #662, Q2). */
function floorBandOf(pose: VehiclePose): FloorBand {
  return { upx: pose.upx, upy: pose.upy, halfWidthMm: BODY_HALF_SIZE_MM }
}

/** Straight left or right: a diagonal cut follows its path, as a lifting one does (ticket 791). */
function isSideways(pose: VehiclePose): boolean {
  return isSidewaysAim(aimOfPose(pose))
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
