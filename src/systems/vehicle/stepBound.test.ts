import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DRILL_SUBSTEPS_PER_TICK,
  MAX_STEP_MM_PER_TICK,
  POSE_REPORT_INTERVAL_TICKS,
  STEP_BOUND_TOLERANCE_MM,
} from '../../constants/balance'
import { ECONOMY } from '../economy/economy'
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { createSeededRandom } from '../seededRandom'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutStepMmOf } from './cutSpeed'
import { subStepsPerTile } from './drillRule'
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

/** Steps that cut band-1 rock at the tile floor (ticket 396's 4-tick stopgap). */
const FLOOR_BOUND = { drill_power: 2000, drill_tip: 600 }

describe('step bound (ticket 334)', () => {
  it('bounds a cutting step by the drill law through the band rock, plus one sample', () => {
    const rig = rigWith(FLOOR_BOUND)
    const subSteps = subStepsPerTile(vehicleStatsAt(rig.levels), blockHardness(1, 1)) as number
    expect(stepBoundsOf(rig, PARAMS).cuttingMm).toBe(
      cutStepMmOf(subSteps) + STEP_BOUND_TOLERANCE_MM,
    )
  })

  it('bounds a travelling step by the engine top speed rounded up to whole mm, plus one sample', () => {
    for (const engine of [0, 50, 400]) {
      const rig = rigWith({ engine })
      const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
      const travelling = stepBoundsOf(rig, PARAMS).travellingMm - STEP_BOUND_TOLERANCE_MM
      expect(travelling).toBeGreaterThanOrEqual((speedMax * 1000) / 60)
      expect(travelling - 1).toBeLessThan((speedMax * 1000) / 60)
    }
  })

  it('bounds a travelling step by k times a floor-bound cut once it passes the engine', () => {
    const floorStep = cutStepMmOf(ECONOMY.drill.minTicksPerTile * DRILL_SUBSTEPS_PER_TICK)
    const bounds = stepBoundsOf(rigWith({ ...FLOOR_BOUND, engine: 400 }), PARAMS)
    expect(bounds.travellingMm).toBe(Math.floor(floorStep * 1.5) + STEP_BOUND_TOLERANCE_MM)
  })

  it('picks the cutting bound with the cut gate open and the travelling one with it shut', () => {
    const bounds = stepBoundsOf(rigWith(FLOOR_BOUND), PARAMS)
    expect(stepBoundMmOf(bounds, true)).toBe(bounds.cuttingMm)
    expect(stepBoundMmOf(bounds, false)).toBe(bounds.travellingMm)
  })

  it('never bounds a travelling step under a cutting one or under the old 300 mm', () => {
    const random = createSeededRandom(334)
    for (let set = 0; set < 200; set++) {
      const rig = rigWith({
        drill_power: random.nextInt(3000),
        drill_tip: random.nextInt(900),
        engine: random.nextInt(500),
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
    const rig = rigWith(FLOOR_BOUND)
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

describe('step bound past the engine (ticket 334, a one-tick floor)', () => {
  afterEach(() => {
    vi.doUnmock('../economy/economy')
    vi.resetModules()
  })

  it('grows with the drill once k times its cut speed passes the engine', async () => {
    vi.resetModules()
    vi.doMock('../economy/economy', () => ({
      ECONOMY: { ...ECONOMY, drill: { ...ECONOMY.drill, minTicksPerTile: 1 } },
    }))
    const { stepBoundsOf: fastBoundsOf } = await import('./stepBound')
    const bounds = fastBoundsOf(rigWith(FLOOR_BOUND), PARAMS)
    const cutStep = cutStepMmOf(DRILL_SUBSTEPS_PER_TICK)
    expect(bounds.cuttingMm).toBe(cutStep + STEP_BOUND_TOLERANCE_MM)
    expect(bounds.travellingMm).toBe(Math.floor(cutStep * 1.5) + STEP_BOUND_TOLERANCE_MM)
  })
})
