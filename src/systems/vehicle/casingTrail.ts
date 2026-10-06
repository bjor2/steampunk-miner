/**
 * Where casing rings go (decision #41 Placement rule as amended on #56, 5 Oct), integer only: the
 * drill stamp's centre is the tunnel axis, so while the drill is cutting, each time the centre has
 * travelled 0.5 m from the last recorded axis point (squared distance in mm) it is recorded. A
 * recorded point is due for its ring once the stamp's centre is `CASING_RING_LAG_MM` past it, so
 * the drill never cuts its own fresh lining and the ring sits on the axis the stamp really took,
 * curves and drift included. Points are recorded only while drilling (#56 Q3: cement behind the
 * dig, never floor paint from idle travel), but a recorded point falls due on any later pose, so
 * the last rings of a dig are laid as the vehicle backs out.
 *
 * Each recorded point carries the stretch of axis its ring stands for, so the first-place lining
 * charge is per metre of tunnel, not per ring (#76, #115): the distance from the previous point, or
 * one ring spacing when it starts a new cut (no previous point, or one further than the ring lag,
 * whose ring was already due). A dig recorded every 0.5 m and one recorded every 1 m charge the same.
 */
import {
  CASING_RING_LAG_MM,
  CASING_RING_SPACING_MM,
  MAX_CASING_TRAIL_POINTS,
} from '../../constants/balance'

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

function recordAxisPoint(trail: CasingTrail, stampCentre: RingPoint): CasingTrail {
  const last = trail.lastAxisPoint
  if (last !== null && squaredDistance(last, stampCentre) < squared(CASING_RING_SPACING_MM)) {
    return trail
  }
  const point = { ...stampCentre, lengthMm: stretchSince(last, stampCentre) }
  return { lastAxisPoint: stampCentre, unlined: [...trail.unlined, point] }
}

/** The axis length from the previous point, or one ring spacing when this point starts a cut. */
function stretchSince(last: RingPoint | null, stampCentre: RingPoint): number {
  if (last === null) return CASING_RING_SPACING_MM
  const squaredStretch = squaredDistance(last, stampCentre)
  if (squaredStretch > squared(CASING_RING_LAG_MM)) return CASING_RING_SPACING_MM
  return Math.round(Math.sqrt(squaredStretch))
}

/** Points past the lag fall due; past `MAX_CASING_TRAIL_POINTS` the oldest do too. */
function splitDuePoints(trail: CasingTrail, stampCentre: RingPoint): TrailStep {
  const overflow = trail.unlined.length - MAX_CASING_TRAIL_POINTS
  const isDue = (point: AxisPoint, index: number) =>
    index < overflow || isPastLag(point, stampCentre)
  return {
    trail: { ...trail, unlined: trail.unlined.filter((point, index) => !isDue(point, index)) },
    due: trail.unlined.filter(isDue),
  }
}

function isPastLag(point: RingPoint, stampCentre: RingPoint): boolean {
  return squaredDistance(point, stampCentre) >= squared(CASING_RING_LAG_MM)
}

function squaredDistance(a: RingPoint, b: RingPoint): number {
  const dx = a.xMm - b.xMm
  const dy = a.yMm - b.yMm
  return dx * dx + dy * dy
}

function squared(lengthMm: number): number {
  return lengthMm * lengthMm
}
