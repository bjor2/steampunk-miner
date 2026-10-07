/**
 * Where the spoil auger throws its spoil (#162 section 1, G&V feel pass D): the row of tiles across
 * the tunnel behind the miner, against its facing, far enough back that every tile of it is at
 * least `fillBehindM` from the hull. The bore is about two metres wide (`DRILL_STAMP_RADIUS_MM`
 * 950), so the row is the tile straight behind and one either side of it, enough to plug it.
 *
 * Integer millimetres from the integer pose, like the drill's stamp, so every machine names the
 * same tiles. Distances are measured from the vehicle's centre to the nearest point of a tile.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../../../constants/physics'
import {
  facingVectorOf,
  tileOfMillimetres,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** Half the hull, in mm: the clearances below are measured from its edge. */
export const HALF_HULL_MM = (VEHICLE_COLLIDER_SIZE * MM_PER_METRE) / 2

/** The tile straight behind the hull at `fillBehindM` plus half a tile, then its two neighbours. */
export function backfillRowOf(pose: VehiclePose, fillBehindM: number): TilePoint[] {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const reachMm = HALF_HULL_MM + fillBehindM * MM_PER_METRE + MM_PER_METRE / 2
  const centre = { x: pose.x - scaled(ahead.x, reachMm), y: pose.y - scaled(ahead.y, reachMm) }
  const across = { x: -ahead.y, y: ahead.x }
  return [0, 1, -1].map((side) =>
    tileOfMillimetres(
      centre.x + scaled(across.x, side * MM_PER_METRE),
      centre.y + scaled(across.y, side * MM_PER_METRE),
    ),
  )
}

/** Whether the nearest point of `tile` lies at least `clearanceMm` beyond the hull's edge. */
export function isTileClearOfHull(
  pose: VehiclePose,
  tile: TilePoint,
  clearanceMm: number,
): boolean {
  const dx = distanceToSpan(pose.x, tile.tx * MM_PER_METRE)
  const dy = distanceToSpan(pose.y, tile.ty * MM_PER_METRE)
  const reach = HALF_HULL_MM + clearanceMm
  return dx * dx + dy * dy >= reach * reach
}

/** How far `at` lies outside the metre starting at `start`; 0 inside it. */
function distanceToSpan(at: number, start: number): number {
  if (at < start) return start - at
  return Math.max(0, at - (start + MM_PER_METRE))
}

/** A component of a 1024-scaled unit vector, times a length in mm, in whole mm. */
function scaled(component: number, lengthMm: number): number {
  return Math.floor((component * lengthMm) / UP_VECTOR_SCALE)
}
