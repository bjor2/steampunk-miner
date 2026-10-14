import { describe, expect, it } from 'vitest'
import { loadSlices, withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { fromCanonical, fromSafeInteger, mul, toCanonical } from '../money'
import {
  incomeCapRowsOf,
  stackedIncomeOf,
  type IncomeAt,
  type IncomeRate,
  type TripCapSource,
} from './incomeRates'
import { createRegistrySet, swapRegistrySet } from './seal'

// The income-cap check's rates (ticket 384, TD lock "K-ir" on #212): slices register them, the
// check counts a rate only while its anchor row is live, and the kernel clamps each to the trip
// cap. Fake slices register through withRegistrations, so no real slice is imported.

const AT: IncomeAt = {
  planetIndex: 10,
  band: 3,
  cargoCapacity: 24,
  drillOrePerMinute: fromCanonical('1000'),
}

function rateOf(id: string, anchorRowId: string, perMinute: string): IncomeRate {
  return {
    id,
    itemId: `power.${id.split('.')[1]}`,
    anchorRowId,
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

const everyAnchorLive = () => true

function rowsAsText(
  slices: readonly SliceDefinition[],
  isAnchorLive: (rowId: string) => boolean = everyAnchorLive,
) {
  return withRegistrations(slices, () =>
    incomeCapRowsOf(AT, isAnchorLive).map((row) => ({
      ...row,
      valuePerMinute: toCanonical(row.valuePerMinute),
    })),
  )
}

/** `amount` as a row's value reads in canonical text. */
const canonical = (amount: string) => toCanonical(fromCanonical(amount))

describe('income rates', () => {
  it('reports no rows with no rate registered', () => {
    expect(rowsAsText([sliceOf('fake', [], tripCapOf('5'))])).toEqual([])
  })

  it('reports one row per registered rate, by rate id', () => {
    const rows = rowsAsText([sliceOf('fake', [SHIFTER, DRAIN])])
    expect(rows).toEqual([
      { rateId: 'fake.drain', itemId: 'power.drain', valuePerMinute: canonical('40') },
      { rateId: 'fake.shifter', itemId: 'power.shifter', valuePerMinute: canonical('300') },
    ])
  })

  it('counts a rate only while its anchor row is owned or unlocked', () => {
    const liveRows = new Set(['shields'])
    const rows = rowsAsText([sliceOf('fake', [DRAIN, SHIFTER])], (rowId) => liveRows.has(rowId))
    expect(rows.map((row) => row.rateId)).toEqual(['fake.shifter'])
  })

  it('reports nothing for a rate whose anchor row is held or unbuilt', () => {
    expect(rowsAsText([sliceOf('fake', [DRAIN, SHIFTER])], () => false)).toEqual([])
  })

  it('clamps each rate to the trip cap of the hold it is asked at', () => {
    // 24 units at 5 a unit: a cap of 120, under the shifter's 300 and over the drain's 40.
    const rows = rowsAsText([sliceOf('fake', [DRAIN, SHIFTER], tripCapOf('5'))])
    expect(rows.map((row) => row.valuePerMinute)).toEqual([canonical('40'), canonical('120')])
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
      stackedIncomeOf(incomeCapRowsOf(AT, everyAnchorLive)),
    )
    expect(toCanonical(stacked)).toBe(canonical('160'))
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
    const owned = new Set(['power.drain'])
    const rows = rowsAsText([sliceOf('fake', [drain])], (rowId) => owned.has(rowId))
    expect(rows.map((row) => row.rateId)).toEqual(['fake.drain'])
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
