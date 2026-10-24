import { describe, expect, it } from 'vitest'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { emptyDrillPaceTally, feltCellsPerSecond, feltCellsPerSecondInSystem } from './drillPace'
import { emptyRadiusRebaselineTally } from './radiusRebaseline'
import { emptyStarMapTravelTally } from './starMapTravel'
import type { StarMapTravelRun } from './starMapTravelBars'
import { gatedSystemJumpProblemsOf, printedSystemJumpLinesOf } from './systemJumpBars'

const SEED = 83921
const HELD_TICKS = 100
const LEVELS = onCurveSteps(5)
const ARRIVAL = feltCellsPerSecondInSystem(LEVELS, 6, 2n)

/** One seed whose planet 5 averaged `planetFiveFelt` cells/s and that jumped with `LEVELS`. */
function runOf(worldSeed: number, planetFiveFelt: number, hasJumped = true): StarMapTravelRun {
  const drill = emptyDrillPaceTally()
  drill.planets.set(5, {
    planet: 5,
    arrivalTick: 0,
    coreTick: 1,
    drillPurchases: 3,
    feltTicks: planetFiveFelt * HELD_TICKS,
    heldTicks: HELD_TICKS,
    coreFelt: planetFiveFelt,
    longestGapTicks: 0,
    majors: 5,
    drillTipMajors: 5,
    catchUpPurchases: 0,
    trackSpend: {},
    tankEmpties: 0,
  })
  return {
    worldSeed,
    drill,
    radius: emptyRadiusRebaselineTally(),
    starMap: emptyStarMapTravelTally(),
    systemJumpLevels: hasJumped ? { ...LEVELS } : null,
  }
}

function threeSeeds(planetFiveFelt: number, hasJumped = true): StarMapTravelRun[] {
  return [SEED, SEED + 1, SEED + 2].map((seed) => runOf(seed, planetFiveFelt, hasJumped))
}

describe('system jump bar (ticket 759)', () => {
  it('cuts system 2 slower than system 1 at the same campaign index and levels', () => {
    expect(ARRIVAL).toBeGreaterThan(0)
    expect(ARRIVAL).toBeLessThan(feltCellsPerSecond(LEVELS, 6))
  })

  it('passes an arrival at 0.9x planet 5 or more', () => {
    expect(gatedSystemJumpProblemsOf(threeSeeds(ARRIVAL / 0.95))).toEqual([])
  })

  it('fails an arrival under 0.9x planet 5, naming the ratio', () => {
    expect(gatedSystemJumpProblemsOf(threeSeeds(ARRIVAL / 0.8))).toEqual([
      "system jump P5->S2P1 felt 0.80x planet 5's average, under 0.9",
    ])
  })

  it('fails a run that never jumped out of system 1', () => {
    expect(gatedSystemJumpProblemsOf(threeSeeds(ARRIVAL, false))).toEqual([
      "the bot never jumped out of system 1's planet 5",
    ])
  })

  it('prints the arrival felt speed and its ratio', () => {
    expect(printedSystemJumpLinesOf(threeSeeds(ARRIVAL))).toEqual([
      `system jump P5->S2P1: felt ${ARRIVAL.toFixed(2)} cells/s on arrival, 1.00x planet 5's average`,
    ])
  })
})
