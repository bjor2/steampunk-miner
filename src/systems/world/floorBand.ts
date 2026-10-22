/**
 * A level cut's floor band (GD lock on #662, Q2, the Gameplay & Vehicle Designer's pick): the
 * ground between the drill's disc and its level floor, across the wheels' width. With the bore at
 * the body plus 0.15 m the disc keeps no lift (`drillBore.ts`) and reaches a little past the
 * wheels only under its own centre, so a floor that stepped down a sample settled over two stamps;
 * the band takes the floor down to its ramp under the whole wheel line in one. The casing ring
 * lines the same band (`casingLining.ts`, Q3).
 *
 * Integer arithmetic only, in the pose's 1024-scaled up vector: a sample is in the band when it
 * lies below the stamp's path (along `-up`) and no further along the path's line than
 * `halfWidthMm` past either of its ends. How deep it reaches is the level floor's to say.
 */
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { MM_PER_SAMPLE } from './sampleGrid'

/** The band under a level cut's stamp: the pose's up (1024-scaled) and half the wheels' width. */
export interface FloorBand {
  upx: number
  upy: number
  halfWidthMm: number
}

/** A point of a stamp's path in mm, as `stampShape.ts` names it. */
interface PathPoint {
  xMm: number
  yMm: number
}

/** Whether `(sx, sy)` lies under the path from `tail` to `head` and within the band's width of it. */
export function isInFloorBand(
  band: FloorBand,
  tail: PathPoint,
  head: PathPoint,
  sx: number,
  sy: number,
): boolean {
  const dx = sx * MM_PER_SAMPLE - tail.xMm
  const dy = sy * MM_PER_SAMPLE - tail.yMm
  if (dx * band.upx + dy * band.upy >= 0) return false
  const along = alongOf(band, dx, dy)
  const headAlong = alongOf(band, head.xMm - tail.xMm, head.yMm - tail.yMm)
  const reach = band.halfWidthMm * UP_VECTOR_SCALE
  return along >= Math.min(0, headAlong) - reach && along <= Math.max(0, headAlong) + reach
}

/** How far along the path's line (square to `up`) an offset lies, in mm times 1024. */
function alongOf(band: FloorBand, dx: number, dy: number): number {
  return dx * band.upy - dy * band.upx
}
