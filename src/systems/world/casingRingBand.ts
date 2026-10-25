/**
 * Where a casing ring's band lies (decision #41 "Where", the TD's Q1 and the GD's (e) rulings on
 * #662), integer arithmetic only: the samples `clearMm <= d < clearMm + widthMm` from the ring's
 * shape. A circle's shape is its point. A drill trail's ring is its stretch of axis, from
 * `stretchFromMm` to its point, swept by `sweepMm`, the stamp's offset from the body's line in the
 * cut of the tick the ring fell due: the hole that tick cut, whose walls stand that far from the
 * body's line on the stamp's side (the 3° slant at planet 1's pad, #879). A ring with no sweep is
 * its stretch alone, and a stretch of no length is the circle. The shape stops square at its
 * stretch's start: what lies behind is the stretch before's, its own ring's to line and bill
 * (#76, #115).
 */

/** A point in mm. */
export interface MmPoint {
  xMm: number
  yMm: number
}

/**
 * A ring of lining round `(xMm, yMm)`: inner distance `clearMm`, `widthMm` thick. A drill trail's
 * ring also names where its stretch of axis starts (`stretchFromMm`) and its cut's sweep
 * (`sweepMm`).
 */
export interface CasingRing {
  xMm: number
  yMm: number
  clearMm: number
  widthMm: number
  stretchFromMm?: MmPoint
  sweepMm?: MmPoint
}

/** A sweep of nothing: a pose report's ring, which cuts its stamp where the body stands. */
export const NO_RING_SWEEP: MmPoint = { xMm: 0, yMm: 0 }

/** The ring's shape, corner by corner: stretch start, point, point swept, start swept. */
type RingShape = readonly [MmPoint, MmPoint, MmPoint, MmPoint]

/** Whether the sample at `(xMm, yMm)` lies in the ring's band. */
export function isInRingBand(ring: CasingRing, xMm: number, yMm: number): boolean {
  const shape = ringShapeOf(ring)
  const point = { xMm, yMm }
  if (isBehindStretch(shape, point)) return false
  if (isInsideShape(shape, point)) return false
  return (
    isFartherThanAll(shape, point, ring.clearMm) && isNearerThanAny(shape, point, outerOf(ring))
  )
}

/** The mm box every sample of the ring's shape within `reachMm` of it lies in. */
export function ringShapeBoxOf(
  ring: CasingRing,
  reachMm: number,
): { minXMm: number; maxXMm: number; minYMm: number; maxYMm: number } {
  const shape = ringShapeOf(ring)
  const xs = shape.map(({ xMm }) => xMm)
  const ys = shape.map(({ yMm }) => yMm)
  return {
    minXMm: Math.min(...xs) - reachMm,
    maxXMm: Math.max(...xs) + reachMm,
    minYMm: Math.min(...ys) - reachMm,
    maxYMm: Math.max(...ys) + reachMm,
  }
}

function outerOf(ring: CasingRing): number {
  return ring.clearMm + ring.widthMm
}

function ringShapeOf(ring: CasingRing): RingShape {
  const from = ring.stretchFromMm ?? { xMm: ring.xMm, yMm: ring.yMm }
  const sweep = ring.sweepMm ?? NO_RING_SWEEP
  return [
    from,
    { xMm: ring.xMm, yMm: ring.yMm },
    { xMm: ring.xMm + sweep.xMm, yMm: ring.yMm + sweep.yMm },
    { xMm: from.xMm + sweep.xMm, yMm: from.yMm + sweep.yMm },
  ]
}

/** Behind the square cut across the stretch at its start; a stretch of no length has no behind. */
function isBehindStretch([from, to]: RingShape, point: MmPoint): boolean {
  const ax = to.xMm - from.xMm
  const ay = to.yMm - from.yMm
  const along = (point.xMm - from.xMm) * ax + (point.yMm - from.yMm) * ay
  return ax * ax + ay * ay > 0 && along <= 0
}

/** Strictly inside a swept shape with area: distance 0, short of any band. */
function isInsideShape(shape: RingShape, point: MmPoint): boolean {
  if (crossOf(shape[0], shape[1], shape[3]) === 0) return false
  const sides = edgesOf(shape).map(([from, to]) => sideOf(from, to, point))
  return sides.every((side) => side >= 0) || sides.every((side) => side <= 0)
}

function isFartherThanAll(shape: RingShape, point: MmPoint, distanceMm: number): boolean {
  return edgesOf(shape).every(([from, to]) => !isNearerThan(from, to, point, distanceMm))
}

function isNearerThanAny(shape: RingShape, point: MmPoint, distanceMm: number): boolean {
  return edgesOf(shape).some(([from, to]) => isNearerThan(from, to, point, distanceMm))
}

function edgesOf([a, b, c, d]: RingShape): readonly (readonly [MmPoint, MmPoint])[] {
  return [
    [a, b],
    [b, c],
    [c, d],
    [d, a],
  ]
}

/** Which side of the edge the point lies: the sign of the cross product. */
function sideOf(from: MmPoint, to: MmPoint, point: MmPoint): number {
  return Math.sign(crossOf(from, to, point))
}

function crossOf(origin: MmPoint, a: MmPoint, b: MmPoint): number {
  const ax = a.xMm - origin.xMm
  const ay = a.yMm - origin.yMm
  return ax * (b.yMm - origin.yMm) - ay * (b.xMm - origin.xMm)
}

/**
 * Whether the point lies nearer than `distanceMm` to the edge, squared in integers: to an end past
 * it, else along the perpendicular, its cross product squared against the distance squared times
 * the edge's squared length.
 */
function isNearerThan(from: MmPoint, to: MmPoint, point: MmPoint, distanceMm: number): boolean {
  const ex = to.xMm - from.xMm
  const ey = to.yMm - from.yMm
  const wx = point.xMm - from.xMm
  const wy = point.yMm - from.yMm
  const lengthSq = ex * ex + ey * ey
  const along = wx * ex + wy * ey
  const limitSq = distanceMm * distanceMm
  if (along <= 0) return wx * wx + wy * wy < limitSq
  if (along >= lengthSq) return squaredBetween(point, to) < limitSq
  const cross = wx * ey - wy * ex
  return cross * cross < limitSq * lengthSq
}

function squaredBetween(a: MmPoint, b: MmPoint): number {
  const dx = a.xMm - b.xMm
  const dy = a.yMm - b.yMm
  return dx * dx + dy * dy
}
