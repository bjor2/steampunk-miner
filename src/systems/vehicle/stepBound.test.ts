import { describe, expect, it } from 'vitest'
import {
  MAX_STEP_MM_PER_TICK,
  POSE_REPORT_INTERVAL_TICKS,
  STEP_BOUND_TOLERANCE_MM,
} from '../../constants/balance'
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { createSeededRandom } from '../seededRandom'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutStepMmOf } from './cutSpeed'
import { drillQuantumOnPlanet } from './drillQuantum'
import { subStepsPerTileAt } from './drillRule'
import { guestPoseToleranceMm, speedOfStepBound, stepBoundMmOf, stepBoundsOf } from './stepBound'
import { FACING } from './vehiclePose'
import { newVehicleState, type VehicleState } from './vehicleState'

// The pose bound from stats (ticket 334): (cutting ? cutStep : travelStep) + one 250 mm sample.

const PARAMS = planetParamsFor(83921, 1)
const SURFACE_Y = (surfaceRowOfColumn(20, PARAMS.radiusTiles) + 1) * 1000 + 450

/** A rig standing on the surface of planet 1 with the given stored steps. */
function rigWith(levels: Partial<VehicleState['levels']> = {}): VehicleState {
  const fresh = newVehicleState(null, 0)
  const pose = { x: 20_500, y: SURFACE_Y, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.down }
  return { ...fresh, pose, levels: { ...fresh.levels, ...levels } }
}

/** Steps that cut band-1 rock in one sub-step a cell at the base quantum (no tile floor, #397). */
const ONE_SUB_STEP = { drill_power: 2000, drill_tip: 600 }
/** A drill whose band-1 cut, 278 cells/s, counts in a doubled quantum (ticket 558). */
const FAST_DRILL = { drill_power: 25, drill_tip: 200 }
/** Planet 1's radius, mm: the furthest a drill step may reach in a tick (ticket 558). */
const PLANET_REACH_MM = PARAMS.radiusTiles * 1000

/** The drill law's cut step through band-1 rock in the rig's own quantum. */
function lawCutStepOf(rig: VehicleState): number {
  const drill = vehicleStatsAt(rig.levels)
  const quantum = drillQuantumOnPlanet(drill, 1)
  const subSteps = subStepsPerTileAt(quantum, drill, blockHardness(1, 1)) as number
  return cutStepMmOf(subSteps, quantum)
}

describe('step bound (ticket 334)', () => {
  it('bounds a cutting step by the drill law through the band rock, plus one sample', () => {
    for (const levels of [{ drill_power: 5 }, FAST_DRILL]) {
      const rig = rigWith(levels)
      expect(stepBoundsOf(rig, PARAMS).cuttingMm).toBe(lawCutStepOf(rig) + STEP_BOUND_TOLERANCE_MM)
    }
  })

  it('bounds a travelling step by the engine top speed rounded up to whole mm, plus one sample', () => {
    // The engine is bought per purchase since ticket 553: 200 purchases is Systems' tested range.
    for (const engine of [0, 50, 200]) {
      const rig = rigWith({ engine })
      const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
      const travelling = stepBoundsOf(rig, PARAMS).travellingMm - STEP_BOUND_TOLERANCE_MM
      expect(travelling).toBeGreaterThanOrEqual((speedMax * 1000) / 60)
      expect(travelling - 1).toBeLessThan((speedMax * 1000) / 60)
    }
  })

  it('bounds a travelling step by k times the cut once it passes the engine', () => {
    // Engine purchase 13 (11.3 m/s) stands for the old saturating step 400 (10.9 m/s, ticket 553).
    const rig = rigWith({ ...FAST_DRILL, engine: 13 })
    const bounds = stepBoundsOf(rig, PARAMS)
    expect(bounds.travellingMm).toBe(Math.floor(lawCutStepOf(rig) * 1.5) + STEP_BOUND_TOLERANCE_MM)
  })

  it('picks the cutting bound with the cut gate open and the travelling one with it shut', () => {
    const bounds = stepBoundsOf(rigWith(ONE_SUB_STEP), PARAMS)
    expect(stepBoundMmOf(bounds, true)).toBe(bounds.cuttingMm)
    expect(stepBoundMmOf(bounds, false)).toBe(bounds.travellingMm)
  })

  it('never bounds a travelling step under a cutting one or under the old 300 mm', () => {
    const random = createSeededRandom(334)
    for (let set = 0; set < 200; set++) {
      const rig = rigWith({
        drill_power: random.nextInt(3000),
        drill_tip: random.nextInt(900),
        engine: random.nextInt(201),
      })
      const bounds = stepBoundsOf(rig, PARAMS)
      expect(bounds.travellingMm).toBeGreaterThanOrEqual(bounds.cuttingMm)
      expect(bounds.travellingMm).toBeGreaterThan(MAX_STEP_MM_PER_TICK)
    }
  })

  it('leaves only the tolerance to cut with where the tip cannot scratch the rock', () => {
    const deep = planetParamsFor(83921, 40)
    expect(stepBoundsOf(rigWith(), deep).cuttingMm).toBe(STEP_BOUND_TOLERANCE_MM)
  })

  it('bounds by the engine alone off a planet or with no pose', () => {
    const rig = rigWith(ONE_SUB_STEP)
    const engineOnly = stepBoundsOf(rig, null)
    expect(engineOnly.cuttingMm).toBe(STEP_BOUND_TOLERANCE_MM)
    expect(stepBoundsOf({ ...rig, pose: null }, PARAMS)).toEqual(engineOnly)
  })

  it('reads a bound as a top speed in m/s at 60 ticks a second', () => {
    expect(speedOfStepBound(300)).toBe(18)
    expect(speedOfStepBound(1600)).toBe(96)
  })

  it('gives a co-op guest the bound over one report interval', () => {
    expect(guestPoseToleranceMm(400)).toBe(400 * POSE_REPORT_INTERVAL_TICKS)
  })
})

// The TD lock on #397: with no tile floor the bound follows the drill. Ticket 558 lifts the law's
// one-sub-step floor, 60 m of cut a tick (3600 m/s, 5400 travelling): the drill counts in its own
// quantum, so the bound grows on past it until a tick would carry the rig past the planet's radius.
describe('step bound past the sub-step floor (ticket 558)', () => {
  it('cuts past the old floor of 60 250 mm a tick once the drill is fast enough', () => {
    for (const drill_power of [40, 45, 50]) {
      const rig = rigWith({ drill_power, drill_tip: 600 })
      const bounds = stepBoundsOf(rig, PARAMS)
      expect(bounds.cuttingMm).toBeGreaterThan(60_250)
      expect(bounds.cuttingMm).toBe(
        Math.min(lawCutStepOf(rig), PLANET_REACH_MM) + STEP_BOUND_TOLERANCE_MM,
      )
    }
  })

  it('grows with the drill no further a tick than the planet radius, cutting or travelling', () => {
    const bounds = stepBoundsOf(rigWith(ONE_SUB_STEP), PARAMS)
    expect(bounds.cuttingMm).toBe(PLANET_REACH_MM + STEP_BOUND_TOLERANCE_MM)
    expect(bounds.travellingMm).toBe(PLANET_REACH_MM + STEP_BOUND_TOLERANCE_MM)
  })

  it('keeps every bound and its square within safe integers at any drill on any planet', () => {
    for (const planet of [1, 10, 200, 100_000]) {
      const params = planetParamsFor(83921, planet)
      const bounds = stepBoundsOf(rigWith({ drill_power: 5000, drill_tip: 5000 }), params)
      expect(bounds.cuttingMm).toBeLessThanOrEqual(params.radiusTiles * 1000 + 250)
      expect(Number.isSafeInteger(bounds.travellingMm * bounds.travellingMm)).toBe(true)
    }
  })
})
