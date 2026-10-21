/**
 * The swept cut's front (ticket 570, the TD shape on #570 point 2): a plane across the stamp at
 * the point the tick's cut reached, square to the drill's facing. The cut lowers each sample of
 * its stamp to a target once, as the front crosses it, instead of over the ticks its drill time
 * takes, so the face moves with the front and no cell vanishes in one frame later on:
 *
 * - **Behind its rear** (the body's centre, or further on) nothing is touched either: earlier
 *   ticks cut it, and lined it.
 * - **Ahead of the front** nothing is touched: the cut never reaches ground its work has not
 *   reached. The stamp still meets the cells there, so a gate in its disc is reported as before.
 * - **The face**: across the last density sample behind the front the target ramps from 255 down
 *   to 0, one sample's width, so the contour (`ISO_DENSITY`) lies half a sample behind the front
 *   whatever the sample grid. A level cut's floor ramp (`stampShape.ts`) is the same idea.
 * - **The floor**: a level cut's lowest part is cut a sample further on than the face, so the
 *   corner between floor and face is square where the body's lower front meets it.
 * - **The bore**: behind it the whole stamp is cleared, its wall ramped so the contour lies on the
 *   stamp's circle (`boreWallTargetOf`): the bore is the stamp's width whatever the speed.
 * - **What the last front crossed**: there a sample falls at most `CROSSED_DROP_MAX` a tick. The
 *   last front's ramp had already lowered it as far as the front takes it, so what lowers it now
 *   is the bore's wall following a body that slid aside: one sample's ramp across, it would drop
 *   a wall sample by half its range for a slide of a few mm, a cell's edge in one frame (the GD's
 *   pop on #570). Capped, the wall moves with the slide over the ticks after.
 *
 * Integer arithmetic only. The target never rises above a sample's density: the front only lowers.
 */
import { circleExcessMm2Of } from './exactSquares'
import { ISO_DENSITY, MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'
import { boreWallTargetOf, type StampPoint, type WeightedSample } from './stampShape'

/**
 * The front plane: a point on it in mm, the facing it moves along (a 1024-scaled vector), and the
 * point behind which the cut leaves the ground alone (`rear`): the ground behind the body is the
 * ticks before's, recutting it to this tick's level floor would drop the floor under the body's
 * wheels, and the casing it lined lies further back still.
 */
export interface CutFront extends StampPoint {
  aheadX: number
  aheadY: number
  rear: StampPoint
  /** The stamp's radius, mm: the bore's wall lies on it. */
  radiusMm: number
  /** A level cut's floor, its radius from the planet's centre in mm; null for any other cut. */
  floorRadiusMm: number | null
  /** The front the tick before, on a continuing cut; null on a fresh one. */
  crossed: StampPoint | null
}

/** The facing vectors' scale (`UP_VECTOR_SCALE`). */
const AHEAD_SCALE = 1024

/** The density the front leaves a sample at, whatever it holds now. */
function frontTargetOf(sample: WeightedSample, front: CutFront): number {
  if (behindPointMm(sample, front.rear, front) > 0) return SOLID_DENSITY
  const behindFront = behindPointMm(sample, front, front) + floorUndercutMm(sample, front)
  const wall = boreWallTargetOf(sample.weight, front.radiusMm)
  return Math.max(sample.floor, wall, rampTargetOf(behindFront))
}

/** The most a sample the last front crossed falls in a tick: it stays solid (`ISO_DENSITY`). */
const CROSSED_DROP_MAX = ISO_DENSITY - 1

/** The density the front lowers a sample holding `density` to this tick; never above it. */
export function frontLoweredTo(sample: WeightedSample, front: CutFront, density: number): number {
  const target = Math.min(density, frontTargetOf(sample, front))
  if (!isPastCrossedRamp(sample, front)) return target
  return Math.max(target, density - CROSSED_DROP_MAX)
}

/** The last front's ramp, its floor undercut counted, had reached the bottom of its fall here. */
function isPastCrossedRamp(sample: WeightedSample, front: CutFront): boolean {
  if (front.crossed === null) return false
  const behind = behindPointMm(sample, front.crossed, front) + floorUndercutMm(sample, front)
  return behind >= MM_PER_SAMPLE
}

/** How far behind a plane through `point` the sample lies along the facing, in whole mm. */
function behindPointMm({ sx, sy }: WeightedSample, point: StampPoint, front: CutFront): number {
  const dx = point.xMm - sx * MM_PER_SAMPLE
  const dy = point.yMm - sy * MM_PER_SAMPLE
  return Math.floor((dx * front.aheadX + dy * front.aheadY) / AHEAD_SCALE)
}

/**
 * A level cut's lowest part (within `FLOOR_UNDERCUT_HEIGHT_MM` above its floor's circle) is cut a
 * sample further on than the face: the face's ramp, the floor's and the contour drawn between
 * their samples would otherwise round the corner between floor and face, a fillet the body's lower
 * front corner meets short of the face, and a body pressed down onto its floor that way sinks
 * under it until the floor drops a sample.
 */
function floorUndercutMm({ sx, sy }: WeightedSample, front: CutFront): number {
  if (front.floorRadiusMm === null) return 0
  const top = front.floorRadiusMm + FLOOR_UNDERCUT_HEIGHT_MM
  const isLow = circleExcessMm2Of(top, sx * MM_PER_SAMPLE, sy * MM_PER_SAMPLE) > 0
  return isLow ? MM_PER_SAMPLE : 0
}

/** One and a half samples: the floor's own ramp and the row above it. */
const FLOOR_UNDERCUT_HEIGHT_MM = (3 * MM_PER_SAMPLE) / 2

/** 255 at the front, falling one density step per 250/255 mm to 0 a sample's width behind it. */
function rampTargetOf(behindMm: number): number {
  if (behindMm <= 0) return SOLID_DENSITY
  return Math.max(0, SOLID_DENSITY - Math.floor((SOLID_DENSITY * behindMm) / MM_PER_SAMPLE))
}
