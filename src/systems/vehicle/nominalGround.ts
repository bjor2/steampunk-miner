/**
 * The nominal ground a rig's bounds are read in (TD lock on #316 scope 0, ticket 333): the rock of
 * the band the rig stands in (`blockHardness`), cut by its drill as bought, never a client value.
 * The step bound (`stepBound.ts`), the bot's trip estimate and the P200 dive fixture read it.
 *
 * Travel parity, which let `k` times this cut set the rig's travel speed, is retired by Bjor's
 * ruling on #723: the drive moves at the engine's top speed alone (`cutCapSpeed.ts`).
 */
import { blockHardness } from '../economy/oreEconomy'
import type { BigStat } from '../money'
import { MM_PER_METRE } from '../../constants/physics'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { tileOfMillimetres } from './vehiclePose'
import type { VehicleState } from './vehicleState'

/**
 * A step no longer than the planet's radius, the depth from its surface to its centre (ticket 558,
 * the TD's c-speed50 section 3c): past the lifted sub-step floor a drill's step grows without
 * bound, and a tick never needs to move the rig further than that, so the step bound, its squares
 * and the f32 body stay small at any drill power.
 */
export function stepWithinPlanetMm(stepMm: number, params: PlanetParams): number {
  return Math.min(stepMm, params.radiusTiles * MM_PER_METRE)
}

/** The nominal ground: the rock of the band the vehicle stands in; null off a planet or posed nowhere. */
export function bandRockHardnessOf(
  vehicle: VehicleState,
  params: PlanetParams | null,
): BigStat | null {
  if (params === null || vehicle.pose === null) return null
  return bandRockHardnessAt(params, tileOfMillimetres(vehicle.pose.x, vehicle.pose.y))
}

/**
 * The nominal ground at `tile`: its band's rock, never the cell's own hardness, so the surface
 * layer (ticket 625) that softens the top cells of a cut leaves the bounds where they were.
 */
export function bandRockHardnessAt(params: PlanetParams, tile: TilePoint): BigStat {
  return blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
}
