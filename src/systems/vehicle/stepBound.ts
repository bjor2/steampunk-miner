/**
 * The pose bound from stats (TD scope a on #316, locked with both Scalers, ticket 334), replacing
 * #330's fixed 300 mm a tick: how far the rig may move in one fixed step, in integer mm,
 *
 *   stepBoundMm = (cutting ? cutStep : max(driveStep, cutStep)) + STEP_BOUND_TOLERANCE_MM
 *
 * - `cutStep`: the drill law's cut speed through the nominal ground, the rock of the band the rig
 *   stands in (`cutSpeed.ts`), with the drill as bought, while the cut gate is open;
 * - `driveStep`: the engine's top speed rounded up to whole mm a tick (`cutCapSpeed.ts`); since
 *   Bjor's ruling on #723 the drill never sets the drive's speed, but a cut down is the drill's
 *   alone, so the bound with the gate shut still holds the body a down cut left moving;
 * - one 250 mm density sample of tolerance;
 * - the drill counted in its own quantum (`drillQuantum.ts`), so its steps grow past the old
 *   3600 m/s sub-step floor, each no longer than the planet's radius (ticket 558); the engine's
 *   step is its own.
 *
 * The drill's part comes from its `BigStat` stats through `money.ts`, the engine's from its bounded
 * top speed, so no float reaches the bound. The authority refuses a step past it and the client
 * clamps the body's speed to it, both through `stepBoundMmOf`. The bound away from a cut is never
 * below the bound while cutting.
 *
 * A co-op guest proxy (not built) checks a guest's reports against `guestPoseToleranceMm`: the
 * bound over one report interval.
 */
import { POSE_REPORT_INTERVAL_TICKS, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import type { BigStat } from '../money'
import type { PlanetParams } from '../world/planetParams'
import { driveStepMmOf } from './cutCapSpeed'
import { cutStepMmOf } from './cutSpeed'
import { drillQuantumOnPlanet } from './drillQuantum'
import { subStepsPerTileAt, type DrillStats } from './drillRule'
import { bandRockHardnessOf, stepWithinPlanetMm } from './nominalGround'
import { statsOfVehicle, type VehicleState } from './vehicleState'

/** The rig's two bounds, mm a tick, tolerance included: while it cuts, and while it travels. */
export interface StepBounds {
  cuttingMm: number
  travellingMm: number
}

export function stepBoundsOf(vehicle: VehicleState, params: PlanetParams | null): StepBounds {
  const stats = statsOfVehicle(vehicle)
  const cutMm = drillCutStepOf(stats, bandRockHardnessOf(vehicle, params), params)
  const travelStep = Math.max(driveStepMmOf(stats.engine.speedMax), cutMm)
  return {
    cuttingMm: cutMm + STEP_BOUND_TOLERANCE_MM,
    travellingMm: travelStep + STEP_BOUND_TOLERANCE_MM,
  }
}

/**
 * The drill's cut step in its own quantum, no further a tick than the planet's radius (ticket
 * 558); none off a planet or posed nowhere.
 */
function drillCutStepOf(
  drill: DrillStats,
  hardness: BigStat | null,
  params: PlanetParams | null,
): number {
  if (hardness === null || params === null) return 0
  const quantum = drillQuantumOnPlanet(drill, params.planetIndex)
  return stepWithinPlanetMm(cutStepThrough(drill, hardness, quantum), params)
}

/** The bound for a step taken with the cut gate open (`isCutting`) or shut. */
export function stepBoundMmOf(bounds: StepBounds, isCutting: boolean): number {
  return isCutting ? bounds.cuttingMm : bounds.travellingMm
}

/** A bound in mm a tick as the body's top speed in m/s, for the client's clamp. */
export function speedOfStepBound(boundMm: number): number {
  return (boundMm * TICKS_PER_SECOND) / MM_PER_METRE
}

/** A bound in mm a tick as the speed a pose report may carry, in mm/s. */
export function reportSpeedOfStepBound(boundMm: number): number {
  return boundMm * TICKS_PER_SECOND
}

/** How far a co-op guest's report may stray from the last one: the bound over a report interval. */
export function guestPoseToleranceMm(boundMm: number): number {
  return boundMm * POSE_REPORT_INTERVAL_TICKS
}

/** The drill law's step through ground of `hardness` in `quantum`; 0 where the tip cannot scratch it. */
function cutStepThrough(drill: DrillStats, hardness: BigStat, quantum: number): number {
  const subSteps = subStepsPerTileAt(quantum, drill, hardness)
  return subSteps === null ? 0 : cutStepMmOf(subSteps, quantum)
}
