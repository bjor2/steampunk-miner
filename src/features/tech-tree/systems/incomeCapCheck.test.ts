import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import {
  onCurveSteps,
  startLevels,
  type UpgradeLevels,
} from '../../../systems/economy/vehicleStats'
import { fromCanonical, fromSafeInteger, mul, type Money } from '../../../systems/money'
import type {
  IncomeAnchors,
  IncomeAt,
  IncomeRate,
  TripCapSource,
} from '../../../systems/registries/incomeRates'
import { bandDigTicks } from '../../../systems/vehicle/bandDig'
import {
  basisPointsOf,
  drillTripOf,
  failingVerdictsOf,
  incomeCapVerdictsOf,
  knownRedVerdictsOf,
  medianBasisPointsOf,
  milestoneIncomeCapVerdictsOf,
  type PlanetVisit,
  type SeedIncome,
} from './incomeCapCheck'
import { incomeCapTableOf } from './incomeCapTable'
import type { IncomeCap } from './treeEconomy'

// The #385 income cap, per trip (ruling 6167240683): each income item's trip from the kernel
// registry, after the trip cap, against a full hold of the band's ore, in whole basis points, on
// the median of the seeds; an item over the cap before the clamp passes only when play holds it to
// the trip ledger. Fake slices register the rates, so no real slice is imported and the numbers
// stay the test's.

const CAP: IncomeCap = { maxShareBp: 1500, planets: [10], knownRed: {} }

const ON_CURVE = onCurveSteps(10)
const EVERY_ANCHOR_LIVE: IncomeAnchors = { isRowLive: () => true, isItemOwned: () => true }
const NO_ANCHOR_LIVE: IncomeAnchors = { isRowLive: () => false, isItemOwned: () => false }

/** The on-curve vehicle of planet 10 with its drill `offset` steps off the curve. */
function drillOffBy(offset: number): UpgradeLevels {
  return { ...ON_CURVE, drill_power: ON_CURVE.drill_power + offset }
}

function seedOf(levels: UpgradeLevels, anchors = EVERY_ANCHOR_LIVE, planetIndex = 10): SeedIncome {
  const visits: Record<PlanetVisit, UpgradeLevels> = { arrival: levels, departure: levels }
  return { levelsOn: new Map([[planetIndex, visits]]), anchors }
}

/** A rate whose trip is `share` of a full hold of the band's ore wherever it is asked. */
function rateAtShareOf(itemId: string, share: string, isTripCappedInPlay = true): IncomeRate {
  return {
    id: `fake.${itemId}`,
    itemId: `power.${itemId}`,
    anchorRowId: `power.${itemId}`,
    isTripCappedInPlay,
    valuePerMinuteAtFullStack: (at: IncomeAt) => mul(at.drillOrePerMinute, fromCanonical(share)),
  }
}

/** A rate of a fixed `perMinute` wherever it is asked. */
function fixedRateOf(itemId: string, perMinute: Money): IncomeRate {
  return { ...rateAtShareOf(itemId, '0'), valuePerMinuteAtFullStack: () => perMinute }
}

/** The #162 4.5 cap's shape: 15% of a full hold of the band's ore. */
const FIFTEEN_PERCENT_TRIP_CAP: TripCapSource = {
  id: 'fake.trip_cap',
  tripCapAt: (planet, band, hold) =>
    mul(fromCanonical('0.15'), mul(fromSafeInteger(hold), oreValue(oreTier(planet, band)))),
}

function sliceOf(rates: readonly IncomeRate[], tripCap: TripCapSource | null = null) {
  const slice: SliceDefinition = {
    id: 'fake',
    register: (r) => {
      rates.forEach((rate) => r.incomeRate(rate))
      if (tripCap !== null) r.tripCapSource(tripCap)
    },
  }
  return slice
}

function verdictsOf(
  rates: readonly IncomeRate[],
  seeds: readonly SeedIncome[],
  { cap = CAP, tripCap = null as TripCapSource | null } = {},
) {
  return withRegistrations([sliceOf(rates, tripCap)], () => incomeCapVerdictsOf(seeds, cap))
}

function failingItemsOf(verdicts: ReturnType<typeof verdictsOf>) {
  return [...new Set(failingVerdictsOf(verdicts).map((v) => v.itemId))]
}

describe('income cap check', () => {
  it('passes an item whose trip brings 15% of a full hold and fails one past it', () => {
    const rates = [rateAtShareOf('drain', '0.15'), rateAtShareOf('shifter', '0.1501')]
    expect(failingItemsOf(verdictsOf(rates, [seedOf(ON_CURVE)]))).toEqual(['power.shifter'])
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

  it('measures a trip as the minutes the drill takes to fill the hold with the band ore', () => {
    const trip = drillTripOf(10, 5, ON_CURVE)!
    const drilledInATrip = mul(trip.drillOrePerMinute, trip.tripMinutes)
    expect(basisPointsOf(drilledInATrip, trip.holdValue)).toBe(10_000)
  })

  it('judges an item on the median of the seeds that count it', () => {
    // A fixed rate over three drills: the slowest seed alone would put it over the cap.
    const drills = [drillOffBy(-2), drillOffBy(0), drillOffBy(2)]
    const middle = drillTripOf(10, 5, drills[1])!.drillOrePerMinute
    const rate = fixedRateOf('drain', mul(middle, fromCanonical('0.149')))
    const band5 = verdictsOf(
      [rate],
      drills.map((levels) => seedOf(levels)),
    ).filter((v) => v.band === 5 && v.visit === 'arrival')
    expect(band5.map((v) => [v.seedShareBps.length, v.isOverCap])).toEqual([[3, false]])
    expect(band5[0].seedShareBps.filter((share) => share > CAP.maxShareBp)).toHaveLength(1)
    expect(band5[0].medianShareBp).toBe(1490)
  })

  it('counts an item only on the seeds whose run owns its anchor', () => {
    const owned = seedOf(ON_CURVE, {
      isRowLive: () => false,
      isItemOwned: (itemId) => itemId === 'power.shifter',
    })
    const unowned = seedOf(drillOffBy(-2), NO_ANCHOR_LIVE)
    const verdicts = verdictsOf([rateAtShareOf('shifter', '0.5')], [owned, unowned])
    expect(new Set(verdicts.map((v) => v.seedShareBps.length))).toEqual(new Set([1]))
  })

  it('counts a mover zero on every seed while its anchor is unowned', () => {
    const shifter = rateAtShareOf('shifter', '0.5', false)
    expect(verdictsOf([shifter], [seedOf(ON_CURVE, NO_ANCHOR_LIVE)])).toEqual([])
  })

  it('passes an item over the cap before the clamp when play holds it to the trip ledger', () => {
    const drain = rateAtShareOf('drain', '0.4', true)
    const verdicts = verdictsOf([drain], [seedOf(ON_CURVE)], { tripCap: FIFTEEN_PERCENT_TRIP_CAP })
    expect(verdicts.every((v) => v.medianUnclampedBp === 4000 && v.medianShareBp <= 1500)).toBe(
      true,
    )
    expect(failingVerdictsOf(verdicts)).toEqual([])
  })

  it('fails an item over the cap before the clamp that play does not hold to the ledger', () => {
    const shifter = rateAtShareOf('shifter', '0.4', false)
    const verdicts = verdictsOf([shifter], [seedOf(ON_CURVE)], {
      tripCap: FIFTEEN_PERCENT_TRIP_CAP,
    })
    expect(verdicts.every((v) => !v.isOverCap && v.isUnheldInPlay)).toBe(true)
    expect(failingItemsOf(verdicts)).toEqual(['power.shifter'])
  })

  it('lists a known-red item beside the gate and fails no gate with it', () => {
    const cap = { ...CAP, knownRed: { 'power.shifter': 'the ledger ticket' } }
    const shifter = rateAtShareOf('shifter', '0.4', false)
    const verdicts = verdictsOf([shifter], [seedOf(ON_CURVE)], { cap })
    expect(failingVerdictsOf(verdicts)).toEqual([])
    expect(new Set(knownRedVerdictsOf(verdicts).map((v) => v.knownRedBecause))).toEqual(
      new Set(['the ledger ticket']),
    )
  })

  it('never judges a band the tip only skids on', () => {
    const blunt = startLevels()
    expect([1, 2, 3, 4, 5].map((band) => bandDigTicks(10, blunt, band))).toContain(null)
    const verdicts = verdictsOf([rateAtShareOf('drain', '0.1')], [seedOf(blunt)])
    const skidBands = [1, 2, 3, 4, 5].filter((band) => bandDigTicks(10, blunt, band) === null)
    expect(verdicts.filter((v) => skidBands.includes(v.band))).toEqual([])
  })

  it('judges no planet a seed never stood on', () => {
    const elsewhere = seedOf(ON_CURVE, EVERY_ANCHOR_LIVE, 11)
    expect(verdictsOf([rateAtShareOf('drain', '0.5')], [elsewhere])).toEqual([])
  })
})

describe('income cap basis points', () => {
  it('reads a hair over the cap as over it', () => {
    expect(basisPointsOf(fromCanonical('15.00001'), fromSafeInteger(100))).toBe(1501)
    expect(basisPointsOf(fromCanonical('15'), fromSafeInteger(100))).toBe(1500)
  })

  it('takes the middle seed, or the mean of the middle two rounded up', () => {
    expect(medianBasisPointsOf([1600, 1400, 1500])).toBe(1500)
    expect(medianBasisPointsOf([1400, 1501])).toBe(1451)
  })
})

describe('income cap table', () => {
  function tableOf(rates: readonly IncomeRate[], cap: IncomeCap) {
    return withRegistrations([sliceOf(rates, FIFTEEN_PERCENT_TRIP_CAP)], () =>
      incomeCapTableOf(incomeCapVerdictsOf([seedOf(ON_CURVE)], cap), cap),
    )
  }

  it('prints each item at its worst median, before and after the clamp', () => {
    const table = tableOf([rateAtShareOf('drain', '0.2', true)], { ...CAP, planets: [10, 20] })
    expect(table).toContain('| P10 | power.drain | 15.00% | 20.00% |')
    expect(table).toContain('| P20 | no live income item |')
  })

  it('prints an unheld item as failing and a known-red one with its reason', () => {
    const rates = [rateAtShareOf('shifter', '0.2', false), rateAtShareOf('lance', '0.2', false)]
    const table = tableOf(rates, { ...CAP, knownRed: { 'power.lance': 'the ledger ticket' } })
    expect(table).toMatch(
      /\| power\.shifter \|.*\| no \| over the cap unclamped, unheld in play \|/,
    )
    expect(table).toMatch(/\| power\.lance \|.*\| known-red \(.*\): the ledger ticket \|/)
  })

  it('prints a share past a whole hold', () => {
    const table = tableOf([rateAtShareOf('lodestone', '1.23456789', false)], CAP)
    expect(table).toContain('| P10 | power.lodestone | 15.00% | 123.46% |')
  })
})

/** A rate at `share` whose sibling-link adds `linkShare` of the drill's minute (ticket 278). */
function linkedRateOf(itemId: string, share: string, linkShare: string): IncomeRate {
  return {
    ...rateAtShareOf(itemId, share),
    linkValuePerMinuteAtFullStack: (at: IncomeAt) =>
      mul(at.drillOrePerMinute, fromCanonical(linkShare)),
  }
}

function milestoneVerdictsOf(rates: readonly IncomeRate[], seeds: readonly SeedIncome[]) {
  return withRegistrations([sliceOf(rates)], () => milestoneIncomeCapVerdictsOf(seeds, CAP))
}

describe('income cap check with Mark milestones (ticket 278)', () => {
  it("judges an item with its sibling-link's yield added to its own", () => {
    const rates = [linkedRateOf('shifter', '0.1', '0.04'), rateAtShareOf('drain', '0.1')]
    const verdicts = milestoneVerdictsOf(rates, [seedOf(ON_CURVE)])
    const shareOf = (itemId: string) =>
      verdicts.find((v) => v.itemId === itemId && v.band === 5)?.medianShareBp
    expect([shareOf('power.shifter'), shareOf('power.drain')]).toEqual([1400, 1000])
  })

  it('fails an item its sibling-link carries past the cap that passes without it', () => {
    const rates = [linkedRateOf('shifter', '0.1', '0.0501')]
    expect(failingItemsOf(verdictsOf(rates, [seedOf(ON_CURVE)]))).toEqual([])
    expect(failingItemsOf(milestoneVerdictsOf(rates, [seedOf(ON_CURVE)]))).toEqual([
      'power.shifter',
    ])
  })
})
