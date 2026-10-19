/**
 * The rig's drill quantum (ticket 558, #551 B1, the TD's c-speed50 section 4 item 3): the sub-steps
 * of a tick the swept cut counts a cell's drill time in. At a fixed 60 a cell cost at least one, so
 * no rig cut past 3600 cells/s and a cell of `n` sub-steps rounded the rig's speed down by up to
 * 1/n: 2.7% at purchase 20 on soft ground, dead purchases from 33.
 *
 * - The quantum is `DRILL_SUBSTEPS_PER_TICK` doubled until a cell of the planet's softest rock (band
 *   1) costs the rig at least `DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL` sub-steps, at most
 *   `DRILL_QUANTUM_MAX_DOUBLINGS` times. A rig that already pays that many keeps 60, so it cuts,
 *   charges and digests byte for byte as before; every rig cuts within 1% of the law.
 * - It reads the bought drill and the planet only, never the pose or the heat throttle, so it
 *   changes only with a purchase or a planet. Work carried across ticks in one quantum is rescaled
 *   into the next (`subStepsInQuantum`): exactly when it grows, rounded down when it shrinks.
 * - Doubling keeps every quantum a multiple of every smaller one, so growing is a whole multiply.
 */
import {
  DRILL_QUANTUM_MAX_DOUBLINGS,
  DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL,
  DRILL_SUBSTEPS_PER_TICK,
} from '../../constants/balance'
import { blockHardness } from '../economy/oreEconomy'
import type { BigStat } from '../money'
import type { PlanetParams } from '../world/planetParams'
import { subStepsPerTileAt, type DrillStats } from './drillRule'
import { statsOfVehicle, type VehicleState } from './vehicleState'

const SOFTEST_BAND = 1

/** The quantum a drill counts in on ground whose softest rock is `softestHardness`. */
export function drillQuantumOf(drill: DrillStats, softestHardness: BigStat): number {
  let quantum = DRILL_SUBSTEPS_PER_TICK
  for (let doubling = 0; doubling < DRILL_QUANTUM_MAX_DOUBLINGS; doubling++) {
    if (!isTooCoarseAt(quantum, drill, softestHardness)) return quantum
    quantum *= 2
  }
  return quantum
}

/** A softest cell costs fewer sub-steps than the floor; a drill that cannot scratch it is never. */
function isTooCoarseAt(quantum: number, drill: DrillStats, softestHardness: BigStat): boolean {
  const subSteps = subStepsPerTileAt(quantum, drill, softestHardness)
  return subSteps !== null && subSteps < DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL
}

/** The vehicle's quantum on the planet of `params`; the base with no planet. */
export function drillQuantumOfVehicle(vehicle: VehicleState, params: PlanetParams | null): number {
  if (params === null) return DRILL_SUBSTEPS_PER_TICK
  return drillQuantumOnPlanet(statsOfVehicle(vehicle), params.planetIndex)
}

/** The quantum of a drill on planet `planetIndex`, against its band-1 rock. */
export function drillQuantumOnPlanet(drill: DrillStats, planetIndex: number): number {
  return drillQuantumOf(drill, blockHardness(planetIndex, SOFTEST_BAND))
}

/** A quantum above the base this rule can answer: 60 doubled 1 to 11 times (saves, ticket 558). */
export function isLiftedDrillQuantum(value: unknown): boolean {
  let quantum = DRILL_SUBSTEPS_PER_TICK
  for (let doubling = 0; doubling < DRILL_QUANTUM_MAX_DOUBLINGS; doubling++) {
    quantum *= 2
    if (value === quantum) return true
  }
  return false
}

/**
 * Sub-steps of quantum `from` in quantum `to`: exact when `to` is the larger (a whole multiple),
 * rounded down when it is the smaller.
 */
export function subStepsInQuantum(subSteps: number, from: number, to: number): number {
  if (to >= from) return subSteps * (to / from)
  return Math.floor(subSteps / (from / to))
}
