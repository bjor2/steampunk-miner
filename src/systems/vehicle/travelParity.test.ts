import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ECONOMY } from '../economy/economy'
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { cmp, fromCanonical } from '../money'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutStepMmOf } from './cutSpeed'
import {
  doesDrillSetTravel,
  hardestBandRockHardnessOf,
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

/** Steps that cut band-1 rock at the tile floor (ticket 396's 4-tick stopgap). */
const FLOOR_BOUND = { drill_power: 2000, drill_tip: 600 }

/** Steps whose k times cut passes the 6 m/s engine in planet 1's band 1 (6.9) but not band 5 (1.68). */
const BAND_ONE_DRILL = { drill_power: 100, drill_tip: 30 }

/** The rig with its pose moved `depthTiles` straight down from the surface; null for no pose. */
function rigPosedAt(rig: VehicleState, depthTiles: number | null): VehicleState {
  if (depthTiles === null || rig.pose === null) return { ...rig, pose: null }
  return { ...rig, pose: { ...rig.pose, y: rig.pose.y - depthTiles * 1000 } }
}

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

  it('stays the engine top speed exactly while k times the cut is under it', () => {
    for (const engine of [0, 50, 400]) {
      const rig = rigWith({ engine })
      expect(travelSpeedOf(rig, PARAMS)).toBe(vehicleStatsAt(rig.levels).engine.speedMax)
      expect(travelEngineOf(rig, PARAMS)).toEqual(vehicleStatsAt(rig.levels).engine)
      expect(doesDrillSetTravel(rig, PARAMS)).toBe(false)
    }
  })

  // Ticket 396: at the 4-tick floor the cut is 15 m/s, so k times it passes every engine.
  it('lets a floor-bound drill set travel at k times its cut, past every engine top speed', () => {
    const floorStep = cutStepMmOf(ECONOMY.drill.minTicksPerTile * DRILL_SUBSTEPS_PER_TICK)
    const drillSpeed = (Math.floor(floorStep * 1.5) * 60) / 1000
    for (const engine of [0, 50, 400]) {
      const rig = rigWith({ ...FLOOR_BOUND, engine })
      expect(travelSpeedOf(rig, PARAMS)).toBe(drillSpeed)
      expect(doesDrillSetTravel(rig, PARAMS)).toBe(true)
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

describe('engine card judged in the hardest band (#418, GD option a)', () => {
  it('takes the hardest rock of bands 1 to 5 from the table', () => {
    const hardnesses = [1, 2, 3, 4, 5].map((band) => blockHardness(1, band))
    const hardest = hardestBandRockHardnessOf(PARAMS)
    expect(hardnesses.every((hardness) => cmp(hardness, hardest) <= 0)).toBe(true)
    expect(hardnesses.some((hardness) => cmp(hardness, hardest) === 0)).toBe(true)
  })

  it('reads not maxed while k times the cut passes the top speed in band 1 but not the hardest band', () => {
    const rig = rigWith(BAND_ONE_DRILL)
    expect(travelSpeedOf(rig, PARAMS)).toBeGreaterThan(vehicleStatsAt(rig.levels).engine.speedMax)
    expect(doesDrillSetTravel(rig, PARAMS)).toBe(false)
  })

  it('reads maxed once the drill passes the top speed in every band', () => {
    const drill = vehicleStatsAt(rigWith(FLOOR_BOUND).levels)
    const hardestSpeed = (travelStepThrough(drill, hardestBandRockHardnessOf(PARAMS)) * 60) / 1000
    expect(hardestSpeed).toBeGreaterThanOrEqual(drill.engine.speedMax)
    expect(doesDrillSetTravel(rigWith(FLOOR_BOUND), PARAMS)).toBe(true)
  })

  it('reads the same at the dock, mid-shaft and with no pose', () => {
    for (const levels of [BAND_ONE_DRILL, FLOOR_BOUND]) {
      const rig = rigWith(levels)
      const readings = [0, Math.floor(PARAMS.radiusTiles / 2), null].map((depth) =>
        doesDrillSetTravel(rigPosedAt(rig, depth), PARAMS),
      )
      expect(new Set(readings).size).toBe(1)
    }
  })

  it('never reads maxed off a planet', () => {
    expect(doesDrillSetTravel(rigWith(FLOOR_BOUND), null)).toBe(false)
  })
})
