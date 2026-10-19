/**
 * Travel parity (TD lock on #316 scope 0 and the GD's lock on k, ticket 333): away from fresh
 * ground the rig moves at up to
 *
 *   travelCap = max(speedMax, k * cutSpeed(currentDrill, nominal band ground))
 *
 * so a cleared tunnel, a cave or the shaft is never slower than cutting, and never slower than the
 * engine. k is `drill.travelParityK` in `economy.json` (1.5; Systems may tune 1 to 2). The nominal
 * ground is the rock of the band the rig stands in (`blockHardness`), cut by its drill as bought,
 * in integer mm a tick. Derived from stats and the band, never a client value. Under the 4-tick
 * stopgap floor (ticket 396) a floor-bound drill cuts 15 m/s, so `k * cutSpeed` passes every
 * engine's top speed once the drill is strong enough.
 *
 * Every effect that scales with the engine's top speed reads `travelSpeedOf` instead, so it keeps
 * growing once the drill sets travel (GD lock point 3).
 *
 * The engine card says a purchase is worth zero only where `k * cutSpeed` in the planet's hardest
 * band already reaches the top speed it would buy (the #418 reading, GD option a; ticket 553): a
 * step that still speeds travel deeper down does something. With no max level (HS and VS on #551)
 * the step is still sold, and the card shows the ratio `speedMax / (k * cutSpeed)` that says why.
 *
 * The drill's part counts in its own drill quantum and never passes the planet's radius a tick
 * (ticket 558), as the step bound does.
 */
import { blockHardness } from '../economy/oreEconomy'
import { ECONOMY } from '../economy/economy'
import { engineStatsAtStep, type EngineStats } from '../economy/vehicleStats'
import { cmp, floor, fromSafeInteger, mul, toSafeInteger, type BigStat } from '../money'
import { MM_PER_METRE } from '../../constants/physics'
import { BAND_COUNT, bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { cutStepMmOf, metresPerSecondOfStep } from './cutSpeed'
import { drillQuantumOnPlanet } from './drillQuantum'
import { subStepsPerTileAt, type DrillStats } from './drillRule'
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

/**
 * Whether the next engine purchase buys no travel speed anywhere on the planet: k times the
 * drill's cut speed in its hardest band already reaches the top speed that purchase would give,
 * wherever the rig stands. Never off a planet.
 */
export function isNextEngineStepWorthZero(
  vehicle: VehicleState,
  params: PlanetParams | null,
): boolean {
  if (params === null) return false
  const nextSpeedMax = engineStatsAtStep(vehicle.levels.engine + 1).speedMax
  return hardestBandDrillTravelOf(vehicle, params) >= nextSpeedMax
}

/**
 * The engine card's ratio `speedMax / (k * cutSpeed)` in the planet's hardest band: below 1 the
 * drill sets travel there too. Null off a planet or where the tip cannot cut that band.
 */
export function engineParityRatioOf(
  vehicle: VehicleState,
  params: PlanetParams | null,
): number | null {
  if (params === null) return null
  const drillTravel = hardestBandDrillTravelOf(vehicle, params)
  if (drillTravel === 0) return null
  return statsOfVehicle(vehicle).engine.speedMax / drillTravel
}

/** `k * cutSpeed` in m/s through the rock of the planet's hardest band; 0 where it cannot cut. */
function hardestBandDrillTravelOf(vehicle: VehicleState, params: PlanetParams): number {
  const stats = statsOfVehicle(vehicle)
  return metresPerSecondOfStep(
    drillTravelOnPlanet(stats, hardestBandRockHardnessOf(params), params),
  )
}

/** `k * cutSpeed` of the drill in the rock of the band the vehicle stands in; 0 with no pose. */
function drillTravelStepOf(
  drill: DrillStats,
  vehicle: VehicleState,
  params: PlanetParams | null,
): number {
  const hardness = bandRockHardnessOf(vehicle, params)
  return hardness === null || params === null ? 0 : drillTravelOnPlanet(drill, hardness, params)
}

/**
 * `k * cutSpeed` through `hardness` on the planet of `params`: in the drill's quantum, no further a
 * tick than the planet's radius (ticket 558).
 */
export function drillTravelOnPlanet(
  drill: DrillStats,
  hardness: BigStat,
  params: PlanetParams,
): number {
  const quantum = drillQuantumOnPlanet(drill, params.planetIndex)
  return stepWithinPlanetMm(travelStepThrough(drill, hardness, quantum), params)
}

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
  const tile = tileOfMillimetres(vehicle.pose.x, vehicle.pose.y)
  return blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
}

/** The hardest rock of bands 1 to 5 on the planet, read from the table (biome exceptions exist). */
export function hardestBandRockHardnessOf(params: PlanetParams): BigStat {
  let hardest = blockHardness(params.planetIndex, 1)
  for (let band = 2; band <= BAND_COUNT; band++) {
    const hardness = blockHardness(params.planetIndex, band)
    if (cmp(hardness, hardest) > 0) hardest = hardness
  }
  return hardest
}

/**
 * `floor(k * cutStep)` through ground of `hardness`, the drill timed in `quantum` sub-steps a tick
 * (its drill quantum, ticket 558); 0 where the tip cannot scratch it.
 */
export function travelStepThrough(drill: DrillStats, hardness: BigStat, quantum: number): number {
  const subSteps = subStepsPerTileAt(quantum, drill, hardness)
  if (subSteps === null) return 0
  const cutStep = fromSafeInteger(cutStepMmOf(subSteps, quantum))
  return toSafeInteger(floor(mul(ECONOMY.drill.travelParityK, cutStep)))
}
