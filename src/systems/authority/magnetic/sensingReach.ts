/**
 * Sensing inside a magnetic field (GD lock on spec #258 Q2, ticket 290): a reach used from a tile a
 * field holds keeps `sensingReachShareBp` of its base, rounded up, so never under half. Outside
 * every field, and off the magnetic planets, it is the base. The sensing lane asks with the tile
 * a ping, a flare, a buoy or a passive reads from.
 */
import { reachInFieldOf } from '../../economy/magneticHazard'
import { magneticFieldHolding } from '../../registries/magneticGround'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'

/** Whole tiles a reach of `baseTiles` covers when used from `tile`. */
export function sensingReachAt(state: AuthorityState, tile: TilePoint, baseTiles: number): number {
  const params = planetParamsOf(state.planet)
  if (params === null || magneticFieldHolding(params, tile) === null) return baseTiles
  return reachInFieldOf(baseTiles)
}
