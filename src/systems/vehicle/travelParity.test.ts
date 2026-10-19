import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { cmp, fromCanonical } from '../money'
import { planetParamsFor } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutStepMmOf } from './cutSpeed'
import {
  engineParityRatioOf,
  hardestBandRockHardnessOf,
  isNextEngineStepWorthZero,
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

/** Steps that cut band-1 rock in one sub-step a cell, the law's quantum (no tile floor, #397). */
const ONE_SUB_STEP = { drill_power: 106, drill_tip: 600 }

/** Steps whose k times cut passes the 6 m/s engine in planet 1's band 1 but not band 5 (#552: purchase 7). */
const BAND_ONE_DRILL = { drill_power: 7, drill_tip: 30 }

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
    const drill = vehicleStatsAt(rigWith(ONE_SUB_STEP).levels)
    expect(travelStepThrough(drill, blockHardness(1, 1))).toBe(Math.floor(cutStepMmOf(1) * 1.5))
  })

  it('gives no drill travel where the tip cannot scratch the rock', () => {
    const drill = vehicleStatsAt(rigWith().levels)
    expect(travelStepThrough(drill, blockHardness(40, 5))).toBe(0)
  })

  /** Engine purchases 5 and 13: the first at or past the old stored 50 and 400 (ticket 553). */
  const ENGINES = [0, 5, 13]

  it('stays the engine top speed exactly while k times the cut is under it', () => {
    for (const engine of ENGINES) {
      const rig = rigWith({ engine })
      expect(travelSpeedOf(rig, PARAMS)).toBe(vehicleStatsAt(rig.levels).engine.speedMax)
      expect(travelEngineOf(rig, PARAMS)).toEqual(vehicleStatsAt(rig.levels).engine)
      expect(isNextEngineStepWorthZero(rig, PARAMS)).toBe(false)
    }
  })

  // Ticket 397: with no tile floor a one-sub-step cut is 3600 m/s, so k times it passes these engines.
  it('lets a one-sub-step drill set travel at k times its cut, past these engines', () => {
    const drillSpeed = (Math.floor(cutStepMmOf(1) * 1.5) * 60) / 1000
    for (const engine of ENGINES) {
      const rig = rigWith({ ...ONE_SUB_STEP, engine })
      expect(travelSpeedOf(rig, PARAMS)).toBe(drillSpeed)
      expect(isNextEngineStepWorthZero(rig, PARAMS)).toBe(true)
    }
  })

  it('is the engine top speed off a planet or with no pose', () => {
    const rig = rigWith(ONE_SUB_STEP)
    const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
    expect(travelSpeedOf(rig, null)).toBe(speedMax)
    expect(travelSpeedOf({ ...rig, pose: null }, PARAMS)).toBe(speedMax)
  })
})

describe('travel parity past the engine (ticket 333, no tile floor since #397)', () => {
  it('lets the drill set travel once k times its cut speed passes the engine', () => {
    const rig = rigWith({ drill_power: 17, drill_tip: 200 })
    const drill = vehicleStatsAt(rig.levels)
    const drillSpeed = (travelStepThrough(drill, blockHardness(1, 1)) * 60) / 1000
    expect(travelSpeedOf(rig, PARAMS)).toBe(drillSpeed)
    expect(drillSpeed).toBeGreaterThan(drill.engine.speedMax)
    expect(travelEngineOf(rig, PARAMS).accel).toBe(drill.engine.accel)
  })

  // Engine purchase 13 (11.3 m/s) is the first at or past the old stored 400's 10.9 m/s (ticket 553).
  it('never lets travel fall under the engine where the drill is slow', () => {
    const rig = rigWith({ engine: 13 })
    const speedMax = vehicleStatsAt(rig.levels).engine.speedMax
    expect(travelSpeedOf(rig, PARAMS)).toBe(speedMax)
    expect(isNextEngineStepWorthZero(rig, PARAMS)).toBe(false)
  })
})

describe('engine card judged in the hardest band (#418, GD option a; ticket 553)', () => {
  it('takes the hardest rock of bands 1 to 5 from the table', () => {
    const hardnesses = [1, 2, 3, 4, 5].map((band) => blockHardness(1, band))
    const hardest = hardestBandRockHardnessOf(PARAMS)
    expect(hardnesses.every((hardness) => cmp(hardness, hardest) <= 0)).toBe(true)
    expect(hardnesses.some((hardness) => cmp(hardness, hardest) === 0)).toBe(true)
  })

  it('counts the next purchase while k times the cut passes the top speed in band 1 but not the hardest band', () => {
    const rig = rigWith(BAND_ONE_DRILL)
    expect(travelSpeedOf(rig, PARAMS)).toBeGreaterThan(vehicleStatsAt(rig.levels).engine.speedMax)
    expect(isNextEngineStepWorthZero(rig, PARAMS)).toBe(false)
  })

  it('reads the next purchase worth zero once the drill outruns its top speed in every band', () => {
    const rig = rigWith(ONE_SUB_STEP)
    const drill = vehicleStatsAt(rig.levels)
    const hardestSpeed = (travelStepThrough(drill, hardestBandRockHardnessOf(PARAMS)) * 60) / 1000
    expect(hardestSpeed).toBeGreaterThanOrEqual(
      vehicleStatsAt({ ...rig.levels, engine: 1 }).engine.speedMax,
    )
    expect(isNextEngineStepWorthZero(rig, PARAMS)).toBe(true)
  })

  it('counts the purchase that carries the top speed past the drill, as it buys travel', () => {
    const rig = rigWith(ONE_SUB_STEP)
    const drill = vehicleStatsAt(rig.levels)
    const hardestSpeed = (travelStepThrough(drill, hardestBandRockHardnessOf(PARAMS)) * 60) / 1000
    let engine = 0
    while (vehicleStatsAt({ ...rig.levels, engine: engine + 1 }).engine.speedMax <= hardestSpeed) {
      engine++
    }
    expect(
      isNextEngineStepWorthZero(rigWith({ ...ONE_SUB_STEP, engine: engine - 1 }), PARAMS),
    ).toBe(true)
    expect(isNextEngineStepWorthZero(rigWith({ ...ONE_SUB_STEP, engine }), PARAMS)).toBe(false)
  })

  it('gives the ratio of the top speed to k times the cut in the hardest band', () => {
    const rig = rigWith(ONE_SUB_STEP)
    const drill = vehicleStatsAt(rig.levels)
    const hardestSpeed = (travelStepThrough(drill, hardestBandRockHardnessOf(PARAMS)) * 60) / 1000
    expect(engineParityRatioOf(rig, PARAMS)).toBe(drill.engine.speedMax / hardestSpeed)
    expect(engineParityRatioOf(rig, PARAMS)).toBeLessThan(1)
  })

  it('reads the same at the dock, mid-shaft and with no pose', () => {
    for (const levels of [BAND_ONE_DRILL, ONE_SUB_STEP]) {
      const rig = rigWith(levels)
      const readings = [0, Math.floor(PARAMS.radiusTiles / 2), null].map((depth) =>
        isNextEngineStepWorthZero(rigPosedAt(rig, depth), PARAMS),
      )
      expect(new Set(readings).size).toBe(1)
    }
  })

  it('never reads worth zero, and gives no ratio, off a planet', () => {
    expect(isNextEngineStepWorthZero(rigWith(ONE_SUB_STEP), null)).toBe(false)
    expect(engineParityRatioOf(rigWith(ONE_SUB_STEP), null)).toBeNull()
  })
})
