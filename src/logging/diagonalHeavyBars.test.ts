import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { DigPolicy } from '../systems/bot/mineLayout'
import { fromSafeInteger, ZERO_MONEY } from '../systems/money'
import type { PlanetCasingSpend } from './casingSpend'
import { diagonalHeavyProblemsOf, type DigPolicyRun } from './diagonalHeavyBars'
import type { PlanetDig } from './diagonalDig'
import type { PlanetRadiusPace } from './radiusRebaseline'

// Ticket 899's bars on hand-built runs: a diagonal-heavy run that holds every bar passes, and each
// bar it misses is named for its planet.

const PLANETS = [1, 2, 3, 4, 5]
const MINUTE = 60 * TICKS_PER_SECOND

/** One planet as a run left it. */
interface PlanetShape {
  minutes: number
  sales: number
  casing: number
  spend: number
  diagonalTiles: number
  otherMetres: number
  billedMm: number
}

const CARDINAL: PlanetShape = {
  minutes: 26,
  sales: 2600,
  casing: 150,
  spend: 1000,
  diagonalTiles: 0,
  otherMetres: 1000,
  billedMm: 950_000,
}

/** Most of the cut at 45°: 800 tiles (1131 m) against 200 m, billed 0.9 m a metre cut. */
const DIAGONAL: PlanetShape = {
  ...CARDINAL,
  diagonalTiles: 800,
  otherMetres: 200,
  billedMm: Math.round(0.9 * (800 * Math.SQRT2 + 200) * 1000),
}

function runOf(digPolicy: DigPolicy, shape: PlanetShape, worldSeed = 1): DigPolicyRun {
  return {
    worldSeed,
    digPolicy,
    radius: {
      planets: new Map(PLANETS.map((planet) => [planet, paceOf(planet, shape)])),
      hops: [],
      trip: null,
      fuelForHop: { cost: ZERO_MONEY, listPrice: ZERO_MONEY },
    },
    casing: {
      planets: new Map(PLANETS.map((planet) => [planet, casingOf(planet, shape)])),
      wallet: null,
    },
    dig: {
      planets: new Map(PLANETS.map((planet) => [planet, digOf(planet, shape)])),
      boredTile: null,
    },
  }
}

function paceOf(planet: number, shape: PlanetShape): PlanetRadiusPace {
  return {
    planet,
    arrivalTick: 0,
    coreTick: shape.minutes * MINUTE,
    salesToCore: fromSafeInteger(shape.sales),
    walletAtCore: ZERO_MONEY,
    tripTicks: 0,
    climbTicks: 0,
  }
}

function casingOf(planet: number, shape: PlanetShape): PlanetCasingSpend {
  return {
    planet,
    casingSpend: fromSafeInteger(shape.casing),
    spend: fromSafeInteger(shape.spend),
    arrivalWallet: fromSafeInteger(1000),
    arrivalGradePrice: fromSafeInteger(200),
    collapses: 0,
  }
}

function digOf(planet: number, shape: PlanetShape): PlanetDig {
  return {
    planet,
    otherCutMetres: shape.otherMetres,
    diagonalCutMetres: shape.diagonalTiles * Math.SQRT2,
    diagonalTiles: shape.diagonalTiles,
    billedMm: shape.billedMm,
    offRulePrices: 0,
  }
}

function problemsWith(diagonal: Partial<PlanetShape>): string[] {
  return diagonalHeavyProblemsOf([
    runOf('cardinal', CARDINAL),
    runOf('diagonal_heavy', { ...DIAGONAL, ...diagonal }),
  ])
}

describe('diagonal-heavy bars (ticket 899)', () => {
  it('passes a run that holds every bar on P1-P5', () => {
    expect(problemsWith({})).toEqual([])
  })

  it('fails a run that cuts under half its tunnel at 45°', () => {
    expect(problemsWith({ diagonalTiles: 100, otherMetres: 900 })).toHaveLength(PLANETS.length * 2)
    expect(problemsWith({ diagonalTiles: 100, otherMetres: 900 })[0]).toMatch(/P1: .* at 45°/)
  })

  it('fails a planet outside 22-30 minutes, and money a minute off the cardinal run by over 5%', () => {
    const problems = problemsWith({ minutes: 31, sales: 3100 })
    expect(problems.filter((problem) => problem.includes('to the core'))).toHaveLength(5)
    expect(problems.filter((problem) => problem.includes('money a minute'))).toHaveLength(0)
    expect(problemsWith({ sales: 2400 }).filter((p) => p.includes('money a minute'))).toHaveLength(
      5,
    )
  })

  it('fails casing outside 12-20% of spend', () => {
    expect(problemsWith({ casing: 250 })[0]).toBe(
      "P1: casing is 25.00% of the diagonal-heavy run's spend, outside 12%-20%",
    )
  })

  it('fails lining billed by depth alone, about 0.71x the cardinal run a metre cut', () => {
    const byDepth = Math.round(0.95 * (800 + 200) * 1000)
    expect(problemsWith({ billedMm: byDepth })[0]).toMatch(/lining a metre cut is 0\.7\d\dx/)
  })

  it('judges the seed medians', () => {
    const runs = [
      runOf('cardinal', CARDINAL, 1),
      runOf('cardinal', CARDINAL, 2),
      runOf('cardinal', CARDINAL, 3),
      runOf('diagonal_heavy', DIAGONAL, 1),
      runOf('diagonal_heavy', DIAGONAL, 2),
      runOf('diagonal_heavy', { ...DIAGONAL, minutes: 50, sales: 5000 }, 3),
    ]
    expect(diagonalHeavyProblemsOf(runs)).toEqual([])
  })
})
