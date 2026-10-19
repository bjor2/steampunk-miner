/**
 * A scripted body held at the cut's face (ticket 570): since the swept cut rides the body's face, a
 * live body never moves into ground the cut has not opened, so a fixture's scripted pose moves
 * toward where the script wants it only as far as the ground ahead of its face is open, as the
 * live body does. Only specs use it.
 */
import { CUT_FACE_MARGIN_MM } from '../../constants/balance'
import { UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { frontOfCursor, type SweptCut } from '../vehicle/sweptCut'
import { facingVectorOf, type VehiclePose } from '../vehicle/vehiclePose'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { groundReaderOf, type GroundReader } from '../world/groundReader'
import type { PlanetParams } from '../world/planetParams'
import { ISO_DENSITY } from '../world/sampleGrid'
import type { WorldState } from '../world/worldState'

/** A position in mm. */
export interface Point {
  x: number
  y: number
}

/** Half the body's side, mm: its face this far ahead of its centre. */
const HALF_BODY_MM = (VEHICLE_COLLIDER_SIZE * 1000) / 2
/** The face is judged this far either side of the body's centre line, a little inside its corners. */
const FACE_HALF_WIDTH_MM = HALF_BODY_MM - 25
/** The scan's strides, coarse to fine: half a sample, then 25 mm, then 1 mm. */
const SCAN_STRIDES_MM = [125, 25, 1]

/**
 * The pose moved from where it stands toward `target`, no further than the ground ahead of its face
 * along its facing is open (the contour, `ISO_DENSITY`), in whole mm.
 */
export function stepIntoOpenGround(
  world: WorldState,
  params: PlanetParams,
  pose: VehiclePose,
  target: Point,
): Point {
  const dx = target.x - pose.x
  const dy = target.y - pose.y
  const lengthMm = Math.floor(Math.sqrt(dx * dx + dy * dy))
  if (lengthMm === 0) return { x: pose.x, y: pose.y }
  const isOpenAt = openFaceProbeOf(groundReaderOf(world, params), pose, { dx, dy, lengthMm })
  let run = 0
  for (const stride of SCAN_STRIDES_MM) {
    while (run + stride <= lengthMm && isOpenAt(run + stride)) run += stride
  }
  return pointAlongMove(pose, { dx, dy, lengthMm }, run)
}

/**
 * The pose moved along its facing to ride the cut's front exactly: its centre the front's distance
 * back (the face, the contact margin and the half sample the front's ramp leaves), as a body that
 * keeps up with its cut stands; as it was with no cut yet.
 */
export function poseRidingFront(pose: VehiclePose, cursor: SweptCut | undefined): Point {
  if (cursor === undefined) return { x: pose.x, y: pose.y }
  const front = frontOfCursor(cursor)
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const backMm = HALF_BODY_MM + CUT_FACE_MARGIN_MM + MM_PER_SAMPLE / 2
  return {
    x: front.xMm - Math.round((ahead.x * backMm) / UP_VECTOR_SCALE),
    y: front.yMm - Math.round((ahead.y * backMm) / UP_VECTOR_SCALE),
  }
}

/** A move from the pose: its components and its length, mm. */
interface Move {
  dx: number
  dy: number
  lengthMm: number
}

/** Whether the body's face, moved `mm` along the move, lies in open ground across its width. */
function openFaceProbeOf(reader: GroundReader, pose: VehiclePose, move: Move) {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const unit = { x: ahead.x / UP_VECTOR_SCALE, y: ahead.y / UP_VECTOR_SCALE }
  return (mm: number) => {
    const centre = pointAlongMove(pose, move, mm)
    return [-FACE_HALF_WIDTH_MM, 0, FACE_HALF_WIDTH_MM].every((across) => {
      const xMm = centre.x + unit.x * HALF_BODY_MM - unit.y * across
      const yMm = centre.y + unit.y * HALF_BODY_MM + unit.x * across
      return reader.densityAtPoint(xMm / 1000, yMm / 1000) < ISO_DENSITY
    })
  }
}

function pointAlongMove(pose: VehiclePose, { dx, dy, lengthMm }: Move, mm: number): Point {
  return {
    x: pose.x + Math.round((dx * mm) / lengthMm),
    y: pose.y + Math.round((dy * mm) / lengthMm),
  }
}
