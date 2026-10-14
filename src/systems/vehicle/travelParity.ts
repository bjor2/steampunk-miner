/**
 * Travel parity (TD lock on #316 scope 0 and the GD's lock on k, ticket 333): away from fresh
 * ground the rig moves at up to
 *
 *   travelCap = max(speedMax, k * cutSpeed(currentDrill, nominal band ground))
 *
 * so a cleared tunnel, a cave or the shaft is never slower than cutting, and never slower than the
 * engine. k is `drill.travelParityK` in `economy.json` (1.5; Systems may tune 1 to 2). The nominal
 * ground is the rock of the band the rig stands in (`blockHardness`), cut by its drill as bought,
 * in integer mm a tick. Derived from stats and the band, never a client value. With today's
 * 24-tick floor `k * cutSpeed` stays under the engine's lowest top speed, so `travelCap` is
 * `speedMax` exactly until the #304 drill law lands.
 *
 * Every effect that scales with the engine's top speed reads `travelSpeedOf` instead, so it keeps
 * growing once the drill sets travel (GD lock point 3).
 */
import { blockHardness } from '../economy/oreEconomy'
import { ECONOMY } from '../economy/economy'
import type { EngineStats } from '../economy/vehicleStats'
import { floor, fromSafeInteger, mul, toSafeInteger, type BigStat } from '../money'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { cutStepMmOf, metresPerSecondOfStep } from './cutSpeed'
import { subStepsPerTile, type DrillStats } from './drillRule'
import { tileOfMillimetres } from './vehiclePose'
import { statsOfVehicle, type VehicleState } from './vehicleState'

/** The effective travel speed in m/s: the engine's top speed, or k times the drill's cut speed. */
export function travelSpeedOf(vehicle: VehicleState, params: PlanetParams | null): number {
  return travelEngineOf(vehicle, params).speedMax
}

/** The engine with `travelSpeedOf` as its top speed; the engine itself while that is `speedMax`. */
export function travelEngineOf(vehicle: VehicleState, params: PlanetParams | null): EngineStats {
  const stats = statsOfVehicle(vehicle)
  const drillSpeed = metresPerSecondOfStep(drillTravelStepOf(stats, vehicle, params))
  return drillSpeed > stats.engine.speedMax
    ? { ...stats.engine, speedMax: drillSpeed }
    : stats.engine
}

/** The engine card's maxed check: k times the drill's cut speed has reached the top speed. */
export function doesDrillSetTravel(vehicle: VehicleState, params: PlanetParams | null): boolean {
  const stats = statsOfVehicle(vehicle)
  return metresPerSecondOfStep(drillTravelStepOf(stats, vehicle, params)) >= stats.engine.speedMax
}

/** `k * cutSpeed` of the drill in the rock of the band the vehicle stands in; 0 with no pose. */
function drillTravelStepOf(
  drill: DrillStats,
  vehicle: VehicleState,
  params: PlanetParams | null,
): number {
  if (params === null || vehicle.pose === null) return 0
  const tile = tileOfMillimetres(vehicle.pose.x, vehicle.pose.y)
  return travelStepThrough(
    drill,
    blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty)),
  )
}

/** `floor(k * cutStep)` through ground of `hardness`; 0 where the tip cannot scratch it. */
export function travelStepThrough(drill: DrillStats, hardness: BigStat): number {
  const subSteps = subStepsPerTile(drill, hardness)
  if (subSteps === null) return 0
  const cutStep = fromSafeInteger(cutStepMmOf(subSteps))
  return toSafeInteger(floor(mul(ECONOMY.drill.travelParityK, cutStep)))
}
