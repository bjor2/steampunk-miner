/**
 * Where a survey flare lands (#162 Sensing row, 4.3): the mortar lobs its shell up and back, then
 * arcs it toward the aim side, and it lands its range away along the miner's facing (the arc the
 * tech-tree FX draws with `flareShellPointOf`). It lands a long way off whatever lies between, so
 * the landing is the origin moved along the facing, in whole tiles: every client reads the same
 * tile from the same pose.
 */
import { UP_VECTOR_SCALE } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { facingVectorOf } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** The tile `rangeTiles` along the player's facing from `origin`; `origin` with no pose. */
export function flareLandingOf(
  state: AuthorityState,
  playerId: string,
  origin: TilePoint,
  rangeTiles: number,
): TilePoint {
  const pose = state.players[playerId]?.vehicle.pose ?? null
  if (pose === null) return origin
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return {
    tx: origin.tx + Math.round((facing.x * rangeTiles) / UP_VECTOR_SCALE),
    ty: origin.ty + Math.round((facing.y * rangeTiles) / UP_VECTOR_SCALE),
  }
}
