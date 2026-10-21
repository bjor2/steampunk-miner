/**
 * Where casing rings go (decision #41 Placement rule as amended on #56, 5 Oct), integer only: the
 * drill stamp's centre is the tunnel axis, so while the drill is cutting, each time the centre has
 * travelled 0.5 m from the last recorded axis point (squared distance in mm) it is recorded. A
 * recorded point is due for its ring once the stamp's centre is the ring lag past it, so
 * the drill never cuts its own fresh lining and the ring sits on the axis the stamp really took,
 * curves and drift included. Points are recorded only while drilling (#56 Q3: cement behind the
 * dig, never floor paint from idle travel), but a recorded point falls due on any later pose, so
 * the last rings of a dig are laid as the vehicle backs out.
 *
 * Each recorded point carries the stretch of axis its ring stands for, so the first-place lining
 * charge is per metre of tunnel, not per ring (#76, #115): the distance from the previous point, or
 * one ring spacing when it starts a new cut (no previous point, or one further than the ring lag,
 * whose ring was already due). A dig recorded every 0.5 m and one recorded every 1 m charge the same.
 *
 * The swept cut (ticket 330) records along its cut instead (`followCasingTrailAlongCut`): a point
 * every `CASING_RING_SPACING_MM` on the line from the last recorded point to the centre the cut
 * reached, each standing for one spacing, so the rings keep their spacing at any step length. A
 * cut continues the trail when its sweep starts within the ring lag of the last point (ticket 335):
 * measured from the sweep's start, not its end, so a step of any length (16 m at 960 m/s) keeps
 * its rings every 0.5 m instead of starting a new cut at its far end.
 *
 * A rig cutting back over its own trail (ticket 538, the TD ruling 6228998310 on #538): a point is
 * kept only if it lies at least one ring spacing from every point still waiting for its ring, so
 * the way back records nothing among them. A point that rule rejects is dropped and the trail
 * moves on from it, so its stretch is never folded into a later ring: it sits on trail already
 * waiting or lined, and charging it again would be a second first lining. Past
 * `MAX_CASING_TRAIL_POINTS` the newest waiting points are dropped the same way; nothing is laid
 * before the stamp is the ring lag past it, so no ring is ever laid under or ahead of the stamp.
 */
import { CASING_RING_SPACING_MM, MAX_CASING_TRAIL_POINTS } from '../../constants/balance'
import { casingRingLagMm } from './drillBore'

/** A point in world mm: where a casing ring is centred. */
export interface RingPoint {
  xMm: number
  yMm: number
}

/** A recorded axis point and the stretch of tunnel axis its ring lines, in mm. */
export interface AxisPoint extends RingPoint {
  lengthMm: number
}

export interface CasingTrail {
  /** The newest recorded axis point, or null before the first cut. */
  lastAxisPoint: RingPoint | null
  /** Recorded points not yet lined, oldest first. */
  unlined: readonly AxisPoint[]
}

export interface TrailStep {
  trail: CasingTrail
  /** Axis points whose ring is due now, oldest first. */
  due: AxisPoint[]
}

export const EMPTY_CASING_TRAIL: CasingTrail = { lastAxisPoint: null, unlined: [] }

/** The trail after the stamp's centre reached `stampCentre`; `isCutting` records a new point. */
export function followCasingTrail(
  trail: CasingTrail,
  stampCentre: RingPoint,
  isCutting: boolean,
): TrailStep {
  const recorded = isCutting ? recordAxisPoint(trail, stampCentre) : trail
  return splitDuePoints(recorded, stampCentre)
}

/** Where one swept cut's stamp centre ran: from its sweep's start to where the cut reached. */
export interface CutAxis {
  from: RingPoint
  to: RingPoint
}

/** The trail after the swept cut's stamp centre ran along `axis`, recording at fixed spacing. */
export function followCasingTrailAlongCut(
  trail: CasingTrail,
  axis: CutAxis,
  isCutting: boolean,
): TrailStep {
  const recorded = isCutting ? recordAxisPointsAlong(trail, axis) : trail
  return splitDuePoints(recorded, axis.to)
}

/** One point per whole spacing from the last point toward the cut's end; a new cut starts as before. */
function recordAxisPointsAlong(trail: CasingTrail, { from, to }: CutAxis): CasingTrail {
  const last = trail.lastAxisPoint
  if (last === null || squaredDistance(last, from) > squared(casingRingLagMm())) {
    return recordAxisPoint(trail, to)
  }
  const points = spacedPointsBetween(last, to)
  if (points.length === 0) return trail
  return {
    lastAxisPoint: pointOnly(points[points.length - 1]),
    unlined: [...trail.unlined, ...pointsClearOfWaiting(trail.unlined, last, points)],
  }
}

/**
 * The cut's points not within one spacing of a waiting point. Its points are spaced from each other
 * and from the line's start by construction, to the millimetre `spacedPointsBetween` rounds them
 * to, so only the trail that was already waiting is asked.
 */
function pointsClearOfWaiting(
  unlined: readonly AxisPoint[],
  lineStart: RingPoint,
  points: readonly AxisPoint[],
): AxisPoint[] {
  const others = unlined.filter((waiting) => !isSamePoint(waiting, lineStart))
  return points.filter((point) => !isNearAnyPoint(others, point))
}

function spacedPointsBetween(from: RingPoint, to: RingPoint): AxisPoint[] {
  const length = Math.floor(Math.sqrt(squaredDistance(from, to)))
  const count = Math.floor(length / CASING_RING_SPACING_MM)
  return Array.from({ length: count }, (_, index) => {
    const along = (index + 1) * CASING_RING_SPACING_MM
    return {
      xMm: from.xMm + Math.floor(((to.xMm - from.xMm) * along) / length),
      yMm: from.yMm + Math.floor(((to.yMm - from.yMm) * along) / length),
      lengthMm: CASING_RING_SPACING_MM,
    }
  })
}

function pointOnly({ xMm, yMm }: RingPoint): RingPoint {
  return { xMm, yMm }
}

function recordAxisPoint(trail: CasingTrail, stampCentre: RingPoint): CasingTrail {
  const last = trail.lastAxisPoint
  if (last !== null && isWithinSpacing(last, stampCentre)) return trail
  const point = { ...stampCentre, lengthMm: stretchSince(last, stampCentre) }
  return { lastAxisPoint: stampCentre, unlined: withSpacedPoint(trail.unlined, point) }
}

/** The waiting points with `point` added, unless it lies within one spacing of one (dropped). */
function withSpacedPoint(unlined: readonly AxisPoint[], point: AxisPoint): readonly AxisPoint[] {
  return isNearAnyPoint(unlined, point) ? unlined : [...unlined, point]
}

function isNearAnyPoint(points: readonly RingPoint[], point: RingPoint): boolean {
  return points.some((other) => isWithinSpacing(other, point))
}

function isSamePoint(a: RingPoint, b: RingPoint): boolean {
  return a.xMm === b.xMm && a.yMm === b.yMm
}

function isWithinSpacing(a: RingPoint, b: RingPoint): boolean {
  return squaredDistance(a, b) < squared(CASING_RING_SPACING_MM)
}

/** The axis length from the previous point, or one ring spacing when this point starts a cut. */
function stretchSince(last: RingPoint | null, stampCentre: RingPoint): number {
  if (last === null) return CASING_RING_SPACING_MM
  const squaredStretch = squaredDistance(last, stampCentre)
  if (squaredStretch > squared(casingRingLagMm())) return CASING_RING_SPACING_MM
  return Math.round(Math.sqrt(squaredStretch))
}

/** Only points past the lag fall due; past `MAX_CASING_TRAIL_POINTS` the newest left are dropped. */
function splitDuePoints(trail: CasingTrail, stampCentre: RingPoint): TrailStep {
  const isDue = (point: AxisPoint) => isPastLag(point, stampCentre)
  const waiting = trail.unlined.filter((point) => !isDue(point))
  return {
    trail: { ...trail, unlined: waiting.slice(0, MAX_CASING_TRAIL_POINTS) },
    due: trail.unlined.filter(isDue),
  }
}

function isPastLag(point: RingPoint, stampCentre: RingPoint): boolean {
  return squaredDistance(point, stampCentre) >= squared(casingRingLagMm())
}

function squaredDistance(a: RingPoint, b: RingPoint): number {
  const dx = a.xMm - b.xMm
  const dy = a.yMm - b.yMm
  return dx * dx + dy * dy
}

function squared(lengthMm: number): number {
  return lengthMm * lengthMm
}
