import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { bandDigTicks } from '../../../systems/vehicle/bandDig'
import {
  onCurveSteps,
  startLevels,
  type UpgradeLevels,
} from '../../../systems/economy/vehicleStats'
import { cmp, fromCanonical, mul, toCanonical, type Money } from '../../../systems/money'
import type { IncomeAt, IncomeRate } from '../../../systems/registries/incomeRates'
import {
  drillOrePerMinuteOf,
  incomeCapTableOf,
  incomeCapVerdictsOf,
  overCapVerdictsOf,
  type PlanetVisit,
  type SeedIncome,
} from './incomeCapCheck'
import type { IncomeCap } from './treeEconomy'

// The #385 income cap: each income item's rate from the kernel registry, after the trip cap, is
// judged against the drill's own ore value a minute on the same band, on the median of the seeds.
// Fake slices register the rates, so no real slice is imported and the numbers stay the test's.

const CAP: IncomeCap = { maxShare: fromCanonical('0.15'), planets: [10] }

const ON_CURVE = onCurveSteps(10)

/** The on-curve vehicle of planet 10 with its drill `offset` steps off the curve. */
function drillOffBy(offset: number): UpgradeLevels {
  return { ...ON_CURVE, drill_power: ON_CURVE.drill_power + offset }
}

function seedOf(
  levels: UpgradeLevels,
  isAnchorLive: (rowId: string) => boolean = () => true,
  planetIndex = 10,
): SeedIncome {
  const visits: Record<PlanetVisit, UpgradeLevels> = { arrival: levels, departure: levels }
  return { levelsOn: new Map([[planetIndex, visits]]), isAnchorLive }
}

/** A rate of `share` of the drill's minute wherever it is asked. */
function rateAtShareOf(itemId: string, share: string): IncomeRate {
  return {
    id: `fake.${itemId}`,
    itemId: `power.${itemId}`,
    anchorRowId: `power.${itemId}`,
    valuePerMinuteAtFullStack: (at: IncomeAt) => mul(at.drillOrePerMinute, fromCanonical(share)),
  }
}

/** A rate of a fixed `perMinute` wherever it is asked. */
function fixedRateOf(itemId: string, perMinute: Money): IncomeRate {
  return { ...rateAtShareOf(itemId, '0'), valuePerMinuteAtFullStack: () => perMinute }
}

function sliceOf(rates: readonly IncomeRate[]): SliceDefinition {
  return { id: 'fake', register: (r) => rates.forEach((rate) => r.incomeRate(rate)) }
}

function verdictsOf(rates: readonly IncomeRate[], seeds: readonly SeedIncome[]) {
  return withRegistrations([sliceOf(rates)], () => incomeCapVerdictsOf(seeds, CAP))
}

function overCapItemsOf(rates: readonly IncomeRate[], seeds: readonly SeedIncome[]) {
  return [...new Set(overCapVerdictsOf(verdictsOf(rates, seeds)).map((v) => v.itemId))]
}

describe('income cap check', () => {
  it('passes an item that brings 15% of the drill minute and fails one past it', () => {
    const rates = [rateAtShareOf('drain', '0.15'), rateAtShareOf('shifter', '0.151')]
    expect(overCapItemsOf(rates, [seedOf(ON_CURVE)])).toEqual(['power.shifter'])
  })

  it('judges every band at the arrival and the departure levels', () => {
    const verdicts = verdictsOf([rateAtShareOf('drain', '0.1')], [seedOf(ON_CURVE)])
    expect(verdicts.map((v) => `${v.visit} ${v.band}`)).toEqual([
      'arrival 1',
      'arrival 2',
      'arrival 3',
      'arrival 4',
      'arrival 5',
      'departure 1',
      'departure 2',
      'departure 3',
      'departure 4',
      'departure 5',
    ])
  })

  it('judges an item on the median of the seeds that count it', () => {
    // A fixed rate over three drills: the slowest seed alone would put it over the cap.
    const drills = [drillOffBy(-2), drillOffBy(0), drillOffBy(2)]
    const middle = drillOrePerMinuteOf(10, 5, drills[1]) as Money
    const rate = fixedRateOf('drain', mul(middle, fromCanonical('0.149')))
    const band5 = verdictsOf(
      [rate],
      drills.map((levels) => seedOf(levels)),
    ).filter((v) => v.band === 5 && v.visit === 'arrival')
    expect(band5.map((v) => [v.seedShares.length, v.isOverCap])).toEqual([[3, false]])
    expect(band5[0].seedShares.filter((share) => cmp(share, CAP.maxShare) > 0)).toHaveLength(1)
    expect(toCanonical(band5[0].medianShare)).toBe(toCanonical(fromCanonical('0.149')))
  })

  it('counts an item only on the seeds whose run owns its anchor', () => {
    const owned = seedOf(ON_CURVE, (rowId) => rowId === 'power.shifter')
    const unowned = seedOf(drillOffBy(-2), () => false)
    const verdicts = verdictsOf([rateAtShareOf('shifter', '0.5')], [owned, unowned])
    expect(new Set(verdicts.map((v) => v.seedShares.length))).toEqual(new Set([1]))
  })

  it('counts a mover zero on every seed while its anchor is unowned', () => {
    const verdicts = verdictsOf([rateAtShareOf('shifter', '0.5')], [seedOf(ON_CURVE, () => false)])
    expect(verdicts).toEqual([])
  })

  it('never judges a band the tip only skids on', () => {
    const blunt = startLevels()
    expect([1, 2, 3, 4, 5].map((band) => bandDigTicks(10, blunt, band))).toContain(null)
    const verdicts = verdictsOf([rateAtShareOf('drain', '0.1')], [seedOf(blunt)])
    const skidBands = [1, 2, 3, 4, 5].filter((band) => bandDigTicks(10, blunt, band) === null)
    expect(verdicts.filter((v) => skidBands.includes(v.band))).toEqual([])
  })

  it('judges no planet a seed never stood on', () => {
    const elsewhere = seedOf(ON_CURVE, () => true, 11)
    expect(verdictsOf([rateAtShareOf('drain', '0.5')], [elsewhere])).toEqual([])
  })

  it('prints each item at its worst median and a planet with no live item', () => {
    const rates = [rateAtShareOf('shifter', '0.2')]
    const table = withRegistrations([sliceOf(rates)], () =>
      incomeCapTableOf(incomeCapVerdictsOf([seedOf(ON_CURVE)], CAP), {
        ...CAP,
        planets: [10, 20],
      }),
    )
    expect(table).toContain('| P10 | power.shifter | 20% |')
    expect(table).toContain('over the cap')
    expect(table).toContain('| P20 | no live income item |')
  })
})
