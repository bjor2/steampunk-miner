/**
 * Where a bore gun shot points (ticket 313, the #309 GD decision and its aim amendment): the
 * command names an integer bearing 0 to 255 round the lower half-plane of the rig's frame, from
 * horizontal left (0) through straight down to horizontal right (255). The direction is read
 * from a precomputed integer table (`boreBearings.json`), so the authority never calls trig.
 *
 * The arc runs from horizontal down to 60° below it on each side; the cone 30° either side of
 * straight down is excluded so the gun never pre-cuts the descent shaft. A bearing inside the
 * cone is clamped, never bored as sent, to the 60° edge on its own side; the authority does this
 * whatever the client already snapped.
 */
import type { IntegerVector } from '../../vehicle/vehiclePose'
import BORE_BEARINGS from './boreBearings.json'

/** Bearings 0 to 255. */
export const BORE_BEARING_COUNT = BORE_BEARINGS.bearings.length

const [LEFT_EDGE, RIGHT_EDGE] = BORE_BEARINGS.arcEdges

/** The 60° edge on each side: the bearing a shot inside the cone is clamped to. */
export const ARC_EDGE_BEARINGS = { left: LEFT_EDGE, right: RIGHT_EDGE } as const

/** The bearing actually bored: itself inside the arc, else the 60° edge on its side. */
export function clampedBearing(bearing: number): number {
  if (bearing <= LEFT_EDGE || bearing >= RIGHT_EDGE) return bearing
  return isLeftOfStraightDown(bearing) ? LEFT_EDGE : RIGHT_EDGE
}

/**
 * A shape's line `offset` bearing steps from the aimed one (ticket 377): kept on the table, then
 * clamped to the arc like any bearing, so two offsets past the same edge bore the same line.
 */
export function offsetBearingOf(aimed: number, offset: number): number {
  const onTable = Math.min(BORE_BEARING_COUNT - 1, Math.max(0, clampedBearing(aimed) + offset))
  return clampedBearing(onTable)
}

/**
 * Whether a tile `offset` from the rig's tile lies inside the arc, for a rig whose up vector is
 * `up` (ticket 377: a seam turn stays inside it). In the rig frame the offset must not point
 * upward, and its slope below horizontal must not pass the 60° edge on its side; the rig's own
 * tile and straight down are outside.
 */
export function isTileOffsetInArc(up: IntegerVector, offset: IntegerVector): boolean {
  const along = offset.x * up.y - offset.y * up.x
  const down = -(offset.x * up.x + offset.y * up.y)
  if (down < 0 || along === 0) return false
  const [edgeAlong, edgeDown] = BORE_BEARINGS.bearings[along < 0 ? LEFT_EDGE : RIGHT_EDGE]
  return down * Math.abs(edgeAlong) <= edgeDown * Math.abs(along)
}

/** Whether a bearing lies inside the arc the gun may bore. */
export function isBearingInArc(bearing: number): boolean {
  return clampedBearing(bearing) === bearing
}

/**
 * The world direction of a bearing for a rig whose up vector is `up` (the reported pose's, at
 * `UP_VECTOR_SCALE`): `along * tangent - down * up`, with the tangent `(up.y, -up.x)` as the
 * drill's facing reads it. Integer, at the table's scale times the up vector's.
 */
export function boreDirectionOf(up: IntegerVector, bearing: number): IntegerVector {
  const [along, down] = BORE_BEARINGS.bearings[bearing]
  // Starting from 0 keeps a zero component +0, never -0.
  return { x: 0 + along * up.y - down * up.x, y: 0 - along * up.x - down * up.y }
}

/** Bearings below the middle of the table point down the left half of the cone. */
function isLeftOfStraightDown(bearing: number): boolean {
  return bearing * 2 < BORE_BEARING_COUNT
}
