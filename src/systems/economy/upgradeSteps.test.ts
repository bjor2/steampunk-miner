import { describe, expect, it } from 'vitest'
import { add, cmp, div, fromCanonical, sub, toCanonical, ZERO_MONEY, type Money } from '../money'
import { UPGRADE_IDS, type UpgradeId } from './economyDefinition'
import { stepPrice, upgradePrice } from './upgradePrices'
import {
  isMajorStep,
  majorOf,
  majorsOfSteps,
  minorsPerMajor,
  pipOf,
  stepOfMajor,
  stepsOfMajors,
} from './upgradeSteps'
import {
  cargoCapacity,
  cargoCapacityAtStep,
  drillPower,
  drillPowerAtStep,
  drillTip,
  drillTipAtStep,
  energyMax,
  energyMaxAtStep,
  engineStats,
  engineStatsAtStep,
  hullMax,
  hullMaxAtStep,
  onCurveLevels,
  vehicleStatsAt,
} from './vehicleStats'

const m = fromCanonical
const LEVELS_0_TO_20 = Array.from({ length: 21 }, (_, level) => level)
/** TD acceptance 3: 0..20, and 247, 607 and 6007 where prices pass 1e37, 1e55 and 1e531. */
const PRICED_LEVELS = [...LEVELS_0_TO_20, 247, 607, 6007]
const PIPS = Array.from({ length: 10 }, (_, pip) => pip)

function stepPricesOfMajor(track: UpgradeId, level: number, planetIndex: number): Money[] {
  return PIPS.map((pip) => stepPrice(track, stepOfMajor(level) + pip, planetIndex))
}

function sumOf(prices: readonly Money[]): Money {
  return prices.reduce((total, price) => add(total, price), ZERO_MONEY)
}

/** The relative rise of a stat from one step to the next. */
function riseOf(before: Money, after: Money): Money {
  return div(sub(after, before), before)
}

describe('upgrade steps: the two-tier structure', () => {
  it('makes a major of ten steps: nine pips, then the big level-up', () => {
    expect(minorsPerMajor()).toBe(10)
    expect([majorOf(0), majorOf(9), majorOf(10), majorOf(137)]).toEqual([0, 0, 1, 13])
    expect([pipOf(0), pipOf(9), pipOf(10), pipOf(137)]).toEqual([0, 9, 0, 7])
    expect(PIPS.map((pip) => isMajorStep(130 + pip))).toEqual([...Array(9).fill(false), true])
  })

  it("turns an old save's level L into step 10L and back", () => {
    const majors = onCurveLevels(10)
    expect(stepsOfMajors(majors).drill_power).toBe(10 * majors.drill_power)
    expect(majorsOfSteps(stepsOfMajors(majors))).toEqual(majors)
  })
})

describe('upgrade steps: chain pricing', () => {
  it.each(UPGRADE_IDS)(
    'sums the ten step prices of every %s major to exactly its level price',
    (track) => {
      for (const planetIndex of [1, 7]) {
        for (const level of PRICED_LEVELS) {
          const total = sumOf(stepPricesOfMajor(track, level, planetIndex))
          expect({ level, total: toCanonical(total) }).toEqual({
            level,
            total: toCanonical(upgradePrice(track, level, planetIndex)),
          })
        }
      }
    },
  )

  it.each(UPGRADE_IDS)('prices the big level-up of every %s major above zero', (track) => {
    for (const level of PRICED_LEVELS) {
      const bigLevelUp = stepPricesOfMajor(track, level, 1)[9]
      expect({ level, aboveZero: cmp(bigLevelUp, ZERO_MONEY) > 0 }).toEqual({
        level,
        aboveZero: true,
      })
    }
  })

  it('charges at least 1 a step, and never 1 less than the step before as the totals round', () => {
    for (const track of UPGRADE_IDS) {
      for (const level of LEVELS_0_TO_20) {
        const prices = stepPricesOfMajor(track, level, 1)
        expect(cmp(prices[0], m('1'))).toBeGreaterThanOrEqual(0)
        for (const pip of PIPS.slice(1)) {
          const floor = sub(prices[pip - 1], m('1'))
          expect({ track, level, pip, held: cmp(prices[pip], floor) >= 0 }).toEqual({
            track,
            level,
            pip,
            held: true,
          })
        }
      }
    }
  })

  it('makes the last steps of a dear major cost more than the first, as the curve climbs', () => {
    for (const track of UPGRADE_IDS) {
      const prices = stepPricesOfMajor(track, 40, 1)
      expect({ track, climbing: cmp(prices[9], prices[0]) > 0 }).toEqual({ track, climbing: true })
    }
  })

  // TD acceptance 4: pinned for the Windows determinism job.
  it('pins the first 30 step prices of every track on planet 1', () => {
    const pinned = Object.fromEntries(
      UPGRADE_IDS.map((track) => [
        track,
        Array.from({ length: 30 }, (_, step) => toCanonical(stepPrice(track, step, 1))).join(' '),
      ]),
    )
    expect(pinned).toMatchInlineSnapshot(`
      {
        "boiler": "3e+0 2e+0 2e+0 2e+0 2e+0 3e+0 2e+0 3e+0 2e+0 2e+0 3e+0 3e+0 2e+0 3e+0 3e+0 3e+0 3e+0 3e+0 3e+0 3e+0 4e+0 3e+0 3e+0 3e+0 4e+0 3e+0 4e+0 4e+0 3e+0 4e+0",
        "cargo_hold": "3e+0 2e+0 2e+0 3e+0 2e+0 2e+0 3e+0 2e+0 3e+0 2e+0 3e+0 3e+0 3e+0 3e+0 2e+0 3e+0 3e+0 4e+0 3e+0 3e+0 4e+0 3e+0 4e+0 3e+0 4e+0 3e+0 4e+0 4e+0 4e+0 4e+0",
        "drill_power": "6e+0 5e+0 5e+0 5e+0 6e+0 5e+0 6e+0 6e+0 5e+0 6e+0 7e+0 6e+0 6e+0 7e+0 6e+0 7e+0 7e+0 7e+0 8e+0 7e+0 8e+0 8e+0 8e+0 8e+0 8e+0 8e+0 8e+0 9e+0 9e+0 9e+0",
        "drill_tip": "7e+0 8e+0 7e+0 8e+0 8e+0 8e+0 9e+0 9e+0 1e+1 9e+0 1.1e+1 1.1e+1 1.1e+1 1.1e+1 1.2e+1 1.3e+1 1.3e+1 1.4e+1 1.4e+1 1.5e+1 1.6e+1 1.6e+1 1.7e+1 1.7e+1 1.9e+1 1.8e+1 2e+1 2.1e+1 2.1e+1 2.2e+1",
        "engine": "4e+0 3e+0 4e+0 3e+0 4e+0 3e+0 4e+0 4e+0 4e+0 3e+0 5e+0 4e+0 4e+0 4e+0 4e+0 5e+0 4e+0 5e+0 5e+0 5e+0 5e+0 5e+0 6e+0 5e+0 5e+0 6e+0 5e+0 6e+0 6e+0 6e+0",
        "hull": "5e+0 4e+0 4e+0 5e+0 4e+0 5e+0 5e+0 5e+0 4e+0 5e+0 6e+0 5e+0 5e+0 6e+0 5e+0 6e+0 6e+0 6e+0 6e+0 6e+0 7e+0 6e+0 7e+0 6e+0 7e+0 7e+0 7e+0 8e+0 7e+0 8e+0",
      }
    `)
  })
})

describe('upgrade steps: stats', () => {
  it("lands every track on today's stat at each major", () => {
    for (const level of PRICED_LEVELS) {
      const step = stepOfMajor(level)
      expect(drillPowerAtStep(step)).toEqual(drillPower(level))
      expect(drillTipAtStep(step)).toEqual(drillTip(level))
      expect(hullMaxAtStep(step)).toEqual(hullMax(level))
      expect(energyMaxAtStep(step)).toBe(energyMax(level))
      expect(cargoCapacityAtStep(step)).toBe(cargoCapacity(level))
      expect(engineStatsAtStep(step)).toEqual(engineStats(level))
    }
  })

  it('gives drill power about 0.63% a pip and 5.8% on the big level-up', () => {
    const pip = riseOf(drillPowerAtStep(130), drillPowerAtStep(131))
    const jump = riseOf(drillPowerAtStep(139), drillPowerAtStep(140))
    expect(toCanonical(pip).slice(0, 6)).toBe('6.3158')
    expect(toCanonical(jump).slice(0, 5)).toBe('5.830')
  })

  it('gives the drill tip about 1.27% a pip and 12.0% on the big level-up', () => {
    const pip = riseOf(drillTipAtStep(70), drillTipAtStep(71))
    const jump = riseOf(drillTipAtStep(79), drillTipAtStep(80))
    expect(toCanonical(pip).slice(0, 5)).toBe('1.267')
    expect(toCanonical(jump).slice(0, 5)).toBe('1.200')
  })

  it('adds a cargo unit on pips 3 and 7 and two on the big level-up', () => {
    const capacities = Array.from({ length: 11 }, (_, pip) => cargoCapacityAtStep(80 + pip))
    expect(capacities).toEqual([42, 42, 42, 43, 43, 43, 43, 44, 44, 44, 46])
  })

  it('adds boiler energy on pips 2, 5 and 8 and three on the big level-up', () => {
    const energies = Array.from({ length: 11 }, (_, pip) => energyMaxAtStep(40 + pip))
    expect(energies).toEqual([174, 174, 175, 175, 175, 176, 176, 176, 177, 177, 180])
  })

  it('raises every engine stat a little on every pip, below its maximum', () => {
    for (let step = 0; step < 400; step++) {
      const before = engineStatsAtStep(step)
      const after = engineStatsAtStep(step + 1)
      expect(after.speedMax).toBeGreaterThan(before.speedMax)
      expect(after.accel).toBeGreaterThan(before.accel)
      expect(after.thrustToWeight).toBeGreaterThan(before.thrustToWeight)
      expect(after.speedMax).toBeLessThan(14)
    }
  })

  it('gates on the tip of the last completed major while the live tip climbs its pips', () => {
    const stats = vehicleStatsAt({ ...stepsOfMajors(onCurveLevels(3)), drill_tip: 139 })
    expect(stats.gateTip).toEqual(drillTip(13))
    expect(cmp(stats.drillTip, stats.gateTip)).toBe(1)
    expect(cmp(stats.drillTip, drillTip(14))).toBe(-1)
  })
})
