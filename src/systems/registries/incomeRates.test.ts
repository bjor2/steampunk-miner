import { describe, expect, it } from 'vitest'
import { loadSlices, withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { fromCanonical, fromSafeInteger, mul, toCanonical } from '../money'
import {
  incomeCapRowsOf,
  stackedIncomeOf,
  type IncomeAnchors,
  type IncomeAt,
  type IncomeRate,
  type TripCapSource,
} from './incomeRates'
import { createRegistrySet, swapRegistrySet } from './seal'

// The income-cap check's rates (ticket 384, TD lock "K-ir" on #212): slices register them, the
// check counts a rate only while its anchor row is live, and the kernel clamps each trip of it to
// the trip cap (#385 ruling 6167240683). Fake slices register through withRegistrations, so no real
// slice is imported.

const AT: IncomeAt = {
  planetIndex: 10,
  band: 3,
  cargoCapacity: 24,
  drillOrePerMinute: fromCanonical('1000'),
  tripMinutes: fromCanonical('2'),
}

function rateOf(id: string, anchorRowId: string, perMinute: string): IncomeRate {
  return {
    id,
    itemId: `power.${id.split('.')[1]}`,
    anchorRowId,
    isTripCappedInPlay: true,
    valuePerMinuteAtFullStack: () => fromCanonical(perMinute),
  }
}

/** A trip cap of `perUnit` a hold unit, so the clamp reads the hold it was handed. */
function tripCapOf(perUnit: string): TripCapSource {
  return {
    id: 'fake.trip_cap',
    tripCapAt: (_planet, _band, cargoCapacity) =>
      mul(fromSafeInteger(cargoCapacity), fromCanonical(perUnit)),
  }
}

function sliceOf(
  id: string,
  rates: readonly IncomeRate[],
  tripCap: TripCapSource | null = null,
): SliceDefinition {
  return {
    id,
    register: (r) => {
      rates.forEach((rate) => r.incomeRate(rate))
      if (tripCap !== null) r.tripCapSource(tripCap)
    },
  }
}

const DRAIN = rateOf('fake.drain', 'side_drills', '40')
const SHIFTER = rateOf('fake.shifter', 'shields', '300')

const EVERY_ANCHOR_LIVE: IncomeAnchors = { isRowLive: () => true, isItemOwned: () => true }

/** Anchors where only the rows in `liveRowIds` are owned or unlocked, and no item is owned. */
function rowsLive(...liveRowIds: string[]): IncomeAnchors {
  return { isRowLive: (rowId) => liveRowIds.includes(rowId), isItemOwned: () => false }
}

function rowsAsText(slices: readonly SliceDefinition[], anchors = EVERY_ANCHOR_LIVE) {
  return withRegistrations(slices, () =>
    incomeCapRowsOf(AT, anchors).map((row) => ({
      rateId: row.rateId,
      itemId: row.itemId,
      unclampedValuePerTrip: toCanonical(row.unclampedValuePerTrip),
      valuePerTrip: toCanonical(row.valuePerTrip),
    })),
  )
}

/** `amount` as a row's value reads in canonical text. */
const canonical = (amount: string) => toCanonical(fromCanonical(amount))

describe('income rates', () => {
  it('reports no rows with no rate registered', () => {
    expect(rowsAsText([sliceOf('fake', [], tripCapOf('5'))])).toEqual([])
  })

  it('reports one row per registered rate, by rate id, worth a trip of the rate', () => {
    // Two minutes a trip: the drain's 40 a minute is 80 a trip, the shifter's 300 is 600.
    const rows = rowsAsText([sliceOf('fake', [SHIFTER, DRAIN])])
    expect(rows).toEqual([
      {
        rateId: 'fake.drain',
        itemId: 'power.drain',
        unclampedValuePerTrip: canonical('80'),
        valuePerTrip: canonical('80'),
      },
      {
        rateId: 'fake.shifter',
        itemId: 'power.shifter',
        unclampedValuePerTrip: canonical('600'),
        valuePerTrip: canonical('600'),
      },
    ])
  })

  it('counts a rate only while its anchor row is owned or unlocked', () => {
    const rows = rowsAsText([sliceOf('fake', [DRAIN, SHIFTER])], rowsLive('shields'))
    expect(rows.map((row) => row.rateId)).toEqual(['fake.shifter'])
  })

  it('reports nothing for a rate whose anchor row is held or unbuilt', () => {
    expect(rowsAsText([sliceOf('fake', [DRAIN, SHIFTER])], rowsLive())).toEqual([])
  })

  it('clamps each trip to the trip cap of the hold it is asked at, keeping the unclamped trip', () => {
    // 24 units at 5 a unit: a cap of 120, under the shifter's 600 a trip and over the drain's 80.
    const rows = rowsAsText([sliceOf('fake', [DRAIN, SHIFTER], tripCapOf('5'))])
    expect(rows.map((row) => [row.unclampedValuePerTrip, row.valuePerTrip])).toEqual([
      [canonical('80'), canonical('80')],
      [canonical('600'), canonical('120')],
    ])
  })

  it('counts an item once, under its first rate by id', () => {
    const second = { ...rateOf('fake.zdrain', 'side_drills', '999'), itemId: DRAIN.itemId }
    const rows = rowsAsText([sliceOf('fake', [second, DRAIN, SHIFTER])])
    expect(rows.map((row) => row.rateId)).toEqual(['fake.drain', 'fake.shifter'])
  })

  it('hands every rate the planet, band, hold and drill rate it is asked at', () => {
    const asked: IncomeAt[] = []
    const probe: IncomeRate = {
      ...DRAIN,
      valuePerMinuteAtFullStack: (at) => {
        asked.push(at)
        return fromCanonical('1')
      },
    }
    rowsAsText([sliceOf('fake', [probe])])
    expect(asked).toEqual([AT])
  })

  it('sums the rows after the clamp for the report-only stacked line', () => {
    const stacked = withRegistrations([sliceOf('fake', [DRAIN, SHIFTER], tripCapOf('5'))], () =>
      stackedIncomeOf(incomeCapRowsOf(AT, EVERY_ANCHOR_LIVE)),
    )
    expect(toCanonical(stacked)).toBe(canonical('200'))
  })
})

describe('income rate registration', () => {
  it('refuses a rate id registered twice, naming the slices that registered it', () => {
    expect(() => withRegistrations([sliceOf('fake', [DRAIN, DRAIN])], () => undefined)).toThrow(
      /"fake.drain" is registered twice in "incomeRates": by slice "fake" and by slice "fake"/,
    )
  })

  it('refuses an anchor row that is no stats.json row', () => {
    const typo = rateOf('fake.typo', 'side_drils', '1')
    expect(() => withRegistrations([sliceOf('fake', [typo])], () => undefined)).toThrow(
      /income rate "fake.typo": its anchor row "side_drils" is no row/,
    )
  })

  it("accepts the rate's own item as its anchor, live once the item is owned", () => {
    const drain = rateOf('fake.drain', 'power.drain', '40')
    const owned = {
      isRowLive: () => false,
      isItemOwned: (itemId: string) => itemId === 'power.drain',
    }
    const rows = rowsAsText([sliceOf('fake', [drain])], owned)
    expect(rows.map((row) => row.rateId)).toEqual(['fake.drain'])
  })

  it('never counts a self-anchored rate from a row or feature lookup, only from ownership', () => {
    const drain = rateOf('fake.drain', 'power.drain', '40')
    const rows = rowsAsText([sliceOf('fake', [drain])], {
      isRowLive: () => true,
      isItemOwned: () => false,
    })
    expect(rows).toEqual([])
  })

  it("refuses an anchor that is neither a stats.json row nor the rate's own item", () => {
    const other = rateOf('fake.drain', 'power.shifter', '1')
    expect(() => withRegistrations([sliceOf('fake', [other])], () => undefined)).toThrow(
      /income rate "fake.drain": its anchor row "power.shifter" is no row/,
    )
  })

  it('refuses a rate id without the slice prefix', () => {
    const bare = rateOf('drain.bare', 'side_drills', '1')
    expect(() => withRegistrations([sliceOf('fake', [bare])], () => undefined)).toThrow(
      /its ids start with "fake."/,
    )
  })

  it('refuses a second trip-cap source at the seal', () => {
    const slices = [
      sliceOf('fake', [], tripCapOf('5')),
      sliceOf('other', [], { ...tripCapOf('5'), id: 'other.trip_cap' }),
    ]
    expect(() => withRegistrations(slices, () => undefined)).toThrow(
      /"tripCapSource" takes one provider, but slices "fake" and "other" each registered one/,
    )
  })

  it('refuses a rate registered after the seal', () => {
    const previous = swapRegistrySet(createRegistrySet())
    try {
      loadSlices([])
      expect(() => loadSlices([sliceOf('fake', [DRAIN])])).toThrow(
        /after the registries were sealed/,
      )
    } finally {
      swapRegistrySet(previous)
    }
  })
})
