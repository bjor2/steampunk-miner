import { describe, expect, it } from 'vitest'
import { emptyDrillPaceTally, type PlanetDrillPace } from '../../logging/drillPace'
import { emptyRadiusRebaselineTally, type PlanetRadiusPace } from '../../logging/radiusRebaseline'
import { equilibriumRateStepOf } from '../../logging/radiusRebaselineMedians'
import { emptyStarMapTravelTally } from '../../logging/starMapTravel'
import { fromCanonical, mul, type Money } from '../../systems/money'
import { planetParamsAt } from '../../systems/starMap/systemPlanetParams'
import { planetEconomyRowOf } from './systems/economyRows'
import {
  fuelShareBpOf,
  gatedSystemTwoPaceProblemsOf,
  printedSystemTwoPaceLinesOf,
  SYSTEM_TWO_PACE_BARS,
  SYSTEM_TWO_REBASELINE,
  systemTwoPlanetIndexes,
  type SystemTwoPaceRun,
} from './systemTwoPace'
import { systemTwoPlanetRowsOf, systemTwoReportOf } from './systemTwoPaceReport'

const MINUTE = 3600
const SEEDS = [83921, 31415, 27182]
/** System 1's planet 5, then system 2's five planets at g 6 to 10. */
const RUN_PLANETS = [5, ...systemTwoPlanetIndexes()]
const FIRST_SALES = fromCanonical('100000')

/** A planet's pace as the run folds it: 25 min, felt 10 cells/s, 5 drill + tip majors. */
function paceOf(planet: number, over: Partial<PlanetDrillPace> = {}): PlanetDrillPace {
  return {
    planet,
    arrivalTick: 0,
    coreTick: 25 * MINUTE,
    drillPurchases: 3,
    feltTicks: 10 * 25 * MINUTE,
    heldTicks: 25 * MINUTE,
    coreFelt: 12,
    longestGapTicks: 8 * MINUTE,
    majors: 5,
    drillTipMajors: 5,
    catchUpPurchases: 0,
    trackSpend: {},
    tankEmpties: 0,
    ...over,
  }
}

/** The planet's money over its 25 min, each step on the #551 equilibrium from planet 5's. */
function moneyOf(planet: number, sales: Money): PlanetRadiusPace {
  return {
    planet,
    arrivalTick: 0,
    coreTick: 25 * MINUTE,
    salesToCore: sales,
    walletAtCore: sales,
    tripTicks: 1000,
    climbTicks: 200,
  }
}

function equilibriumSalesOf(planet: number): Money {
  if (planet === RUN_PLANETS[0]) return FIRST_SALES
  const step = equilibriumRateStepOf(planet, SYSTEM_TWO_PACE_BARS.pStar).toFixed(6)
  return mul(equilibriumSalesOf(planet - 1), fromCanonical(step))
}

interface RunChange {
  pace?: (planet: number) => Partial<PlanetDrillPace>
  sales?: (planet: number, onCurve: Money) => Money
  fuel?: string
  hasJumped?: boolean
}

/** One seed's run on pace through system 2, with `change` made to it. */
function runOf(worldSeed: number, change: RunChange = {}): SystemTwoPaceRun {
  const run: SystemTwoPaceRun = {
    worldSeed,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    systemTwo: emptyStarMapTravelTally(),
    hasJumped: change.hasJumped ?? true,
  }
  RUN_PLANETS.forEach((planet) => {
    const sales = equilibriumSalesOf(planet)
    run.drill.planets.set(planet, paceOf(planet, change.pace?.(planet)))
    run.radius.planets.set(planet, moneyOf(planet, change.sales?.(planet, sales) ?? sales))
  })
  run.systemTwo.spend = {
    total: fromCanonical('1000000'),
    fuel: fromCanonical(change.fuel ?? '50000'),
    tank: fromCanonical('0'),
  }
  return run
}

const onPace = (change: RunChange = {}) => SEEDS.map((seed) => runOf(seed, change))

describe('solar system 2 pacing bars (ticket 779)', () => {
  it("keys system 2's planets on their campaign indexes, after system 1's five", () => {
    expect(systemTwoPlanetIndexes()).toEqual([6, 7, 8, 9, 10])
  })

  it('holds every bar on a run on pace: 25 min, flat felt speed, 5 majors, the #551 rate, 5% fuel', () => {
    expect(gatedSystemTwoPaceProblemsOf(onPace())).toEqual([])
  })

  it('names a planet of system 2 outside 22 to 30 minutes, and one whose core was never reached', () => {
    const slow = onPace({ pace: (planet) => (planet === 7 ? { coreTick: 31 * MINUTE } : {}) })
    const never = onPace({ pace: (planet) => (planet === 9 ? { coreTick: null } : {}) })
    expect(gatedSystemTwoPaceProblemsOf(slow)).toEqual([
      'S2P2 (g 7) takes 31.0 min, outside 22 to 30',
    ])
    expect(gatedSystemTwoPaceProblemsOf(never)).toContain(
      'S2P4 (g 9) core never reached on the median seed',
    )
  })

  it("names the jump's felt step under 0.9x system 1's last planet", () => {
    const runs = onPace({ pace: (planet) => (planet >= 6 ? { feltTicks: 8 * 25 * MINUTE } : {}) })
    expect(gatedSystemTwoPaceProblemsOf(runs)).toEqual([
      'S2P1 (g 6) felt speed 0.80x the planet before, under 0.9',
    ])
  })

  it('names drill + tip majors outside 3.5 to 7.0 and prints 7 as amber', () => {
    const many = onPace({ pace: (planet) => (planet === 8 ? { drillTipMajors: 8 } : {}) })
    const amber = onPace({ pace: (planet) => (planet === 8 ? { drillTipMajors: 7 } : {}) })
    expect(gatedSystemTwoPaceProblemsOf(many)).toEqual([
      'S2P3 (g 8) lands 8 drill + tip majors, outside 3.5 to 7',
    ])
    expect(gatedSystemTwoPaceProblemsOf(amber)).toEqual([])
    expect(printedSystemTwoPaceLinesOf(amber)).toContain('S2P3 (g 8) amber: 7 drill + tip majors')
  })

  it('names money per minute more than 5% off the #551 equilibrium step, on g alone at the jump', () => {
    const low = onPace({
      sales: (planet, onCurve) => (planet >= 6 ? mul(onCurve, fromCanonical('0.9')) : onCurve),
    })
    const problems = gatedSystemTwoPaceProblemsOf(low)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^S2P1 \(g 6\) money per minute .* 0\.90x the #551 equilibrium/)
  })

  it('judges fuel at 3-8% of the money spent in system 2', () => {
    expect(gatedSystemTwoPaceProblemsOf(onPace({ fuel: '29999' }))).toEqual([
      'fuel is 299 bp of the money spent in system 2, outside 300-800',
    ])
    expect(gatedSystemTwoPaceProblemsOf(onPace({ fuel: '80000' }))).toEqual([])
    expect(fuelShareBpOf(runOf(SEEDS[0], { fuel: '81000' }))).toBe(810)
  })

  it('names a seed that never jumped, and one that left a core of system 2 behind', () => {
    const runs = onPace()
    runs[0].hasJumped = false
    runs[1].radius.planets.set(10, { ...runs[1].radius.planets.get(10)!, coreTick: null })
    expect(gatedSystemTwoPaceProblemsOf(runs)).toEqual([
      'seed 83921 never jumped into system 2',
      "seed 31415 never completed S2P5 (g 10)'s core",
    ])
  })

  it('prints the fix order for a planet outside 22-30 min: step, paceScale, radius, never the drill law', () => {
    const slow = onPace({ pace: (planet) => (planet === 10 ? { coreTick: 21 * MINUTE } : {}) })
    expect(printedSystemTwoPaceLinesOf(slow)).toContain(
      'S2P5 (g 10) misses 22-30 min: retune the step (k_jump, k_s) first, then its paceScale, ' +
        'then its radius (size class); never the drill law or prices',
    )
  })
})

describe('the "solar system 2" re-baseline rows (ticket 779)', () => {
  it('rows each planet of system 2 under the re-baseline name, the roster beside the world', () => {
    const [run] = onPace()
    const rows = systemTwoPlanetRowsOf([run])
    expect(rows.map((row) => [row.rebaseline, row.place, row.campaignIndex])).toEqual([
      [SYSTEM_TWO_REBASELINE, 1, 6],
      [SYSTEM_TWO_REBASELINE, 2, 7],
      [SYSTEM_TWO_REBASELINE, 3, 8],
      [SYSTEM_TWO_REBASELINE, 4, 9],
      [SYSTEM_TWO_REBASELINE, 5, 10],
    ])
    const [first] = rows
    expect(first.rowRadius).toBe(planetEconomyRowOf(run.worldSeed, 2n, 1n).radiusTiles)
    expect(first.worldRadius).toBe(planetParamsAt(run.worldSeed, 2n, 6).radiusTiles)
    expect([first.minutes, first.feltAverage, first.drillTipMajors]).toEqual(['25.0', '10.00', 5])
    expect(systemTwoReportOf(rows).split('\n')[0]).toBe('Re-baseline "solar system 2" (ticket 779)')
  })
})
