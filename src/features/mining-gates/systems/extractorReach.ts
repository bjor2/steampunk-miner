/**
 * Where an extractor reaches from the vehicle's last reported pose (#142 verb parameters): within a
 * number of tiles of a cell's centre, slow enough to hold a tune, and in line of sight through open
 * tiles for the coil's pull. Integer millimetres throughout, like the pose (#11 amendments).
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** Whether the tile's centre lies within `tiles` whole tiles of the vehicle's centre. */
export function isTileWithinTiles(pose: VehiclePose, tile: TilePoint, tiles: number): boolean {
  const dx = tile.tx * MM_PER_METRE + MM_PER_METRE / 2 - pose.x
  const dy = tile.ty * MM_PER_METRE + MM_PER_METRE / 2 - pose.y
  const reach = tiles * MM_PER_METRE
  return dx * dx + dy * dy <= reach * reach
}

/** Whether the vehicle moves no faster than `mmPerSecond`. */
export function isSlowerThan(pose: VehiclePose, mmPerSecond: number): boolean {
  return pose.vx * pose.vx + pose.vy * pose.vy <= mmPerSecond * mmPerSecond
}

/** Whether the tile still holds ground: some density left in its samples. */
export function isSolidTile(state: AuthorityState, tile: TilePoint): boolean {
  const params = planetParamsOf(state.planet)
  return params !== null && cellDensitySum(state.world, params, tile) > 0
}

/** Every tile strictly between the vehicle's tile and the target is open ground. */
export function isInLineOfSight(state: AuthorityState, pose: VehiclePose, tile: TilePoint) {
  const params = planetParamsOf(state.planet)
  if (params === null) return false
  return tilesBetween(tileOfPose(pose), tile).every((step) => !isSolidIn(state, params, step))
}

function isSolidIn(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  return cellDensitySum(state.world, params, tile) > 0
}

/** The tiles a line from `from` to `to` crosses, both ends left out (Bresenham). */
export function tilesBetween(from: TilePoint, to: TilePoint): TilePoint[] {
  const dx = Math.abs(to.tx - from.tx)
  const dy = -Math.abs(to.ty - from.ty)
  const stepX = Math.sign(to.tx - from.tx)
  const stepY = Math.sign(to.ty - from.ty)
  const crossed: TilePoint[] = []
  let at = { ...from }
  let error = dx + dy
  while (at.tx !== to.tx || at.ty !== to.ty) {
    const doubled = 2 * error
    const next = { ...at }
    if (doubled >= dy) {
      error += dy
      next.tx += stepX
    }
    if (doubled <= dx) {
      error += dx
      next.ty += stepY
    }
    at = next
    if (at.tx !== to.tx || at.ty !== to.ty) crossed.push(at)
  }
  return crossed
}
