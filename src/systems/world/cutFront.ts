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
 * - **The floor**: a level cut's floor band is cut a sample further on than the face, so the corner
 *   between floor and face is square where the body's lower front meets it.
 * - **The bore**: behind it a sample keeps the stamp's soft rim, `255 (W - w) / W` at falloff
 *   weight `w`, so the full-weight core is cleared and the wall's contour stays smooth.
 *
 * Integer arithmetic only. The target never rises above a sample's density: the front only lowers.
 */
import { MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'
import { FULL_WEIGHT, type StampPoint, type WeightedSample } from './stampShape'

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
}

/** The facing vectors' scale (`UP_VECTOR_SCALE`). */
const AHEAD_SCALE = 1024

/** The density the front leaves a sample at, whatever it holds now. */
export function frontTargetOf(sample: WeightedSample, front: CutFront): number {
  if (behindPointMm(sample, front.rear, front) > 0) return SOLID_DENSITY
  const behindFront = behindPointMm(sample, front, front) + floorUndercutMm(sample)
  return Math.max(sample.floor, rimTargetOf(sample.weight), rampTargetOf(behindFront))
}

/** How far behind a plane through `point` the sample lies along the facing, in whole mm. */
function behindPointMm({ sx, sy }: WeightedSample, point: StampPoint, front: CutFront): number {
  const dx = point.xMm - sx * MM_PER_SAMPLE
  const dy = point.yMm - sy * MM_PER_SAMPLE
  return Math.floor((dx * front.aheadX + dy * front.aheadY) / AHEAD_SCALE)
}

/**
 * A level cut's floor band (the samples its floor ramp holds up) is cut a sample further on than
 * the face: the face's ramp and the floor's would otherwise round the corner between them, a fillet
 * the body's lower front corner meets short of the face.
 */
function floorUndercutMm(sample: WeightedSample): number {
  return sample.floor > 0 ? MM_PER_SAMPLE : 0
}

/** 255 at the front, falling one density step per 250/255 mm to 0 a sample's width behind it. */
function rampTargetOf(behindMm: number): number {
  if (behindMm <= 0) return SOLID_DENSITY
  return Math.max(0, SOLID_DENSITY - Math.floor((SOLID_DENSITY * behindMm) / MM_PER_SAMPLE))
}

/** The stamp's soft rim: nothing at weight 0, cleared at full weight. */
function rimTargetOf(weight: number): number {
  return SOLID_DENSITY - Math.floor((SOLID_DENSITY * weight) / FULL_WEIGHT)
}
