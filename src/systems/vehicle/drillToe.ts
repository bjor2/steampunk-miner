/**
 * The face's toe (ticket 491, the fix #458's trace named; TD shape 6209787041 and GD 6209800256 on
 * #491): ground the body's lower front will hit that the drill's contact rule does not see. The
 * collider is built from the blended density (`GroundReader.densityAtPoint`), so a part-cut wedge
 * rising off the floor just past the face is solid to Rapier even where its single samples are
 * under `ISO_DENSITY` or sit below the stamp's floor line. A let-go stop ramp that drives into it
 * bounces the body back, so the stop treats it as the face.
 *
 * The box, in the body's frame: ahead from the face (half the body's side) to the in-the-way reach past
 * it, up from just over the floor under the face to the body's top, on a 25 mm grid (a tenth of a
 * sample). Its lowest row is read off the ground, not a constant: one step above the floor straight
 * under the face. Only a level facing has a toe; down or up, the face is the floor or the roof the
 * contact rule already reads. Everything is integer mm with the pose's 1024-scale vectors, and the
 * blend is the reader's bilinear one in whole numbers, so a replay gives the same answer anywhere.
 */
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { ISO_DENSITY, MM_PER_SAMPLE } from '../world/sampleGrid'
import { BARE_WIDTH_LEVEL, bodyHalfMmAt } from './drillBore'
import { aimOfPose, aimVectorOfPose, isSidewaysAim } from './aim'
import type { IntegerVector, VehiclePose } from './vehiclePose'

/** The box's grid, mm: a tenth of a sample. */
const TOE_STEP_MM = MM_PER_SAMPLE / 10
/** `ISO_DENSITY` at the blend's whole-number scale (a sample's mm, squared). */
const ISO_BLENDED = ISO_DENSITY * MM_PER_SAMPLE * MM_PER_SAMPLE

/** The ground's samples, as the reader holds them now. */
export interface ToeGround {
  densityAt(sx: number, sy: number): number
}

/** The body's centre in mm, its facing and up at the 1024 scale, and half its side in mm. */
interface BodyFrame {
  centre: IntegerVector
  facing: IntegerVector
  up: IntegerVector
  halfMm: number
}

/**
 * Whether blended-solid ground lies in the box ahead of the body's face, up to `reachMm` past it
 * (the in-the-way reach, `inTheWayMmOf`), from just over the floor to the body's top. The body is
 * the one the rig's width level owns (ticket 750), the pose its centre.
 */
export function solidToeAheadOf(
  ground: ToeGround,
  pose: VehiclePose,
  reachMm: number,
  widthLevel = BARE_WIDTH_LEVEL,
): boolean {
  if (!isSidewaysAim(aimOfPose(pose))) return false
  const frame = bodyFrameOf(pose, widthLevel)
  return isSolidInToeBox(ground, frame, lowestToeRowOf(ground, frame), reachMm)
}

function bodyFrameOf(pose: VehiclePose, widthLevel: number): BodyFrame {
  return {
    centre: { x: pose.x, y: pose.y },
    facing: aimVectorOfPose(pose),
    up: { x: pose.upx, y: pose.upy },
    halfMm: bodyHalfMmAt(widthLevel),
  }
}

/**
 * One step above the floor straight under the face: the wheel line and each row over it that still
 * reads solid there is floor (its jitter), so the first open row starts the box.
 */
function lowestToeRowOf(ground: ToeGround, frame: BodyFrame): number {
  let row = -frame.halfMm
  while (row <= frame.halfMm && isSolidAt(ground, frame, frame.halfMm, row)) {
    row += TOE_STEP_MM
  }
  return row
}

function isSolidInToeBox(
  ground: ToeGround,
  frame: BodyFrame,
  lowestRow: number,
  reachMm: number,
): boolean {
  for (let ahead = frame.halfMm; ahead <= frame.halfMm + reachMm; ahead += TOE_STEP_MM) {
    for (let row = lowestRow; row <= frame.halfMm; row += TOE_STEP_MM) {
      if (isSolidAt(ground, frame, ahead, row)) return true
    }
  }
  return false
}

/** Blended-solid ground at `ahead` mm along the facing and `row` mm up from the body's centre. */
function isSolidAt(ground: ToeGround, frame: BodyFrame, ahead: number, row: number): boolean {
  const { centre, facing, up } = frame
  const x = centre.x + Math.floor((ahead * facing.x + row * up.x) / UP_VECTOR_SCALE)
  const y = centre.y + Math.floor((ahead * facing.y + row * up.y) / UP_VECTOR_SCALE)
  return blendedDensityAt(ground, x, y) >= ISO_BLENDED
}

/**
 * The reader's bilinear blend of the four samples round a point in mm (`groundReader.ts`), scaled
 * by a sample's mm squared so it stays a whole number.
 */
function blendedDensityAt(ground: ToeGround, xMm: number, yMm: number): number {
  const sx = Math.floor(xMm / MM_PER_SAMPLE)
  const sy = Math.floor(yMm / MM_PER_SAMPLE)
  const fx = xMm - sx * MM_PER_SAMPLE
  const fy = yMm - sy * MM_PER_SAMPLE
  const bottom = ground.densityAt(sx, sy) * (MM_PER_SAMPLE - fx) + ground.densityAt(sx + 1, sy) * fx
  const top =
    ground.densityAt(sx, sy + 1) * (MM_PER_SAMPLE - fx) + ground.densityAt(sx + 1, sy + 1) * fx
  return bottom * (MM_PER_SAMPLE - fy) + top * fy
}
