/**
 * Cells within 1 m of any vehicle are fixed anchors for a terrain edit (#162 section 3.2, G&V feel
 * pass D): no edit fills, opens or moves one, so it never buries or props up a miner, its owner's
 * or a teammate's. Measured from the hull's edge, half the collider out from the vehicle's centre,
 * to the nearest point of the tile, in whole millimetres. The kernel's copy of the rule the
 * terrain-tools slice plans with (`vehicleAnchors.ts` there), for the kernel's own edits (the
 * magnet shift, ticket 283).
 */
import { MM_PER_METRE, VEHICLE_COLLIDER_SIZE } from '../../../constants/physics'
import type { IntegerVector } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'

/** Half the hull, in mm: the anchor reach is measured from its edge. */
const HALF_HULL_MM = (VEHICLE_COLLIDER_SIZE * MM_PER_METRE) / 2

/** "Within 1 m of any vehicle". */
const ANCHOR_CLEARANCE_MM = MM_PER_METRE

const ANCHOR_REACH_MM = HALF_HULL_MM + ANCHOR_CLEARANCE_MM

/** The centres of every vehicle in the world, in mm, in player order. */
export function vehicleCentresOf(state: AuthorityState): IntegerVector[] {
  return Object.keys(state.players)
    .sort()
    .flatMap((playerId) => {
      const pose = state.players[playerId].vehicle.pose
      return pose === null ? [] : [{ x: pose.x, y: pose.y }]
    })
}

export function isAnchoredByAnyVehicle(
  centres: readonly IntegerVector[],
  tile: TilePoint,
): boolean {
  return centres.some((centre) => isTileWithinReach(centre, tile))
}

function isTileWithinReach(centre: IntegerVector, tile: TilePoint): boolean {
  const dx = distanceToSpan(centre.x, tile.tx * MM_PER_METRE)
  const dy = distanceToSpan(centre.y, tile.ty * MM_PER_METRE)
  return dx * dx + dy * dy < ANCHOR_REACH_MM * ANCHOR_REACH_MM
}

/** How far `at` lies outside the metre starting at `start`; 0 inside it. */
function distanceToSpan(at: number, start: number): number {
  if (at < start) return start - at
  return Math.max(0, at - (start + MM_PER_METRE))
}
