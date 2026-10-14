import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ECONOMY } from '../economy/economy'
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { fromCanonical } from '../money'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutStepMmOf } from './cutSpeed'
import {
  doesDrillSetTravel,
  travelEngineOf,
  travelSpeedOf,
  travelStepThrough,
} from './travelParity'
import { FACING } from './vehiclePose'
import { newVehicleState, type VehicleState } from './vehicleState'

// Travel parity (ticket 333): travelCap = max(speedMax, k * cutSpeed(drill, the band's rock)).

const PARAMS = planetParamsFor(83921, 1)
const SURFACE_Y = (surfaceRowOfColumn(20, PARAMS.radiusTiles) + 1) * 1000 + 450

/** A rig standing on the surface of planet 1 with the given stored steps. */
function rigWith(levels: Partial<VehicleState['levels']> = {}): VehicleState {
  const fresh = newVehicleState(null, 0)
  const pose = { x: 20_500, y: SURFACE_Y, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.down }
  return { ...fresh, pose, levels: { ...fresh.levels, ...levels } }
}

/** Steps that cut band-1 rock at the tile floor (#7's 24-tick cap). */
const FLOOR_BOUND = { drill_power: 2000, drill_tip: 600 }

describe('travel parity (ticket 333)', () => {
  it('reads k from economy.json as 1.5', () => {
    expect(ECONOMY.drill.travelParityK).toEqual(fromCanonical('1.5'))
  })

  it('moves k times the cut step, rounded down, through the band rock', () => {
    const drill = vehicleStatsAt(rigWith(FLOOR_BOUND).levels)
    const floorStep = cutStepMmOf(ECONOMY.drill.minTicksPerTile * DRILL_SUBSTEPS_PER_TICK)
    expect(travelStepThrough(drill, blockHardness(1, 1))).toBe(Math.floor(floorStep * 1.5))
  })

  it('gives no drill travel where the tip cannot scratch the rock', () => {
    const drill = vehicleStatsAt(rigWith().levels)
    expect(travelStepThrough(drill, blockHardness(40, 5))).toBe(0)
  })

  it('stays the engine top speed exactly while k times the floor-bound cut is under it', () => {
    for (const engine of [0, 50, 400]) {
      const rig = rigWith({ ...FLOOR_BOUND, engine })
      expect(travelSpeedOf(rig, PARAMS)).toBe(vehicleStatsAt(rig.levels).engine.speedMax)
      expect(travelEngineOf(rig, PARAMS)).toEqual(vehicleStatsAt(rig.levels).engine)
      expect(doesDrillSetTravel(rig, PARAMS)).toBe(false)
    }
  })

  it('is the engine top speed off a planet or with no pose', () => {
    const rig = rigWith(FLOOR_BOUND)
    const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
    expect(travelSpeedOf(rig, null)).toBe(speedMax)
    expect(travelSpeedOf({ ...rig, pose: null }, PARAMS)).toBe(speedMax)
  })
})

describe('travel parity past the engine (ticket 333, a one-tick floor)', () => {
  afterEach(() => {
    vi.doUnmock('../economy/economy')
    vi.resetModules()
  })

  /** The parity module read with the tile floor at one tick, as a fast #304 law would allow. */
  async function parityWithFastFloor() {
    vi.resetModules()
    vi.doMock('../economy/economy', () => ({
      ECONOMY: { ...ECONOMY, drill: { ...ECONOMY.drill, minTicksPerTile: 1 } },
    }))
    return import('./travelParity')
  }

  it('lets the drill set travel once k times its cut speed passes the engine', async () => {
    const parity = await parityWithFastFloor()
    const rig = rigWith(FLOOR_BOUND)
    const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
    const drillSpeed = (Math.floor(cutStepMmOf(DRILL_SUBSTEPS_PER_TICK) * 1.5) * 60) / 1000
    expect(parity.travelSpeedOf(rig, PARAMS)).toBe(drillSpeed)
    expect(drillSpeed).toBeGreaterThan(speedMax)
    expect(parity.doesDrillSetTravel(rig, PARAMS)).toBe(true)
    expect(parity.travelEngineOf(rig, PARAMS).accel).toBe(vehicleStatsAt(rig.levels).engine.accel)
  })

  it('never lets travel fall under the engine where the drill is slow', async () => {
    const parity = await parityWithFastFloor()
    const rig = rigWith({ engine: 400 })
    const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
    expect(parity.travelSpeedOf(rig, PARAMS)).toBe(speedMax)
    expect(parity.doesDrillSetTravel(rig, PARAMS)).toBe(false)
  })
})
