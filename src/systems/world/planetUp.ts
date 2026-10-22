/**
 * The planet's up at a point (#7's `pos / |pos|`), as a pose carries it: 1024-scaled and rounded,
 * integer arithmetic only, so every machine reading the same point gets the same vector. Within
 * `LOCAL_UP_MIN_RADIUS` of the centre the direction is undefined, and the caller's `held` up stands.
 */
import { LOCAL_UP_MIN_RADIUS, MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import { centreDistanceFloorMmOf } from './exactSquares'

/** An up vector, 1024-scaled, as `VehiclePose` holds it. */
export interface PlanetUp {
  upx: number
  upy: number
}

export function planetUpAt(xMm: number, yMm: number, held: PlanetUp): PlanetUp {
  const radiusMm = centreDistanceFloorMmOf(xMm, yMm)
  if (radiusMm < LOCAL_UP_MIN_RADIUS * MM_PER_METRE) return held
  return {
    upx: Math.round((xMm * UP_VECTOR_SCALE) / radiusMm),
    upy: Math.round((yMm * UP_VECTOR_SCALE) / radiusMm),
  }
}
