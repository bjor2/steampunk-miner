import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { add, cmp, fromCanonical, mul, toCanonical, ZERO_MONEY } from '../../systems/money'
import {
  incomeCapRowsOf,
  type IncomeAnchors,
  type IncomeAt,
} from '../../systems/registries/incomeRates'
import {
  ACT_TICK,
  drainSessionAt,
  ofType,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from './drainTestSession'
import { slice } from './register'
import { drainAtEveryMark, drainForAMinute, DRAIN_INCOME_RATE } from './systems/drainIncomeRate'
import { incomeTripOf } from './systems/incomeTrip'
import { tripCapAt } from './systems/tripCap'

// The drain's row in the kernel's 15% income-cap check (#385): a trip of its minute at the last
// Mark, every charge spent on the band's richest ore, what reaches the hold after the trip cap. It
// anchors on its own item, so it counts once owned, and play pays it through the trip ledger, so
// the cap holds it in play too (ruling 6167240683).

const AT: IncomeAt = {
  planetIndex: 20,
  band: 4,
  cargoCapacity: 48,
  drillOrePerMinute: fromCanonical('1000'),
  tripMinutes: fromCanonical('0.5'),
}

const DRAIN_OWNED: IncomeAnchors = {
  isRowLive: () => false,
  isItemOwned: (itemId) => itemId === 'power.mineral_drain',
}

function drainRowsAt(at: IncomeAt, anchors: IncomeAnchors) {
  return withRegistrations([slice], () => incomeCapRowsOf(at, anchors))
}

describe('mineral drain income rate', () => {
  it('reports a trip of its minute at the last Mark once the drain is owned', () => {
    const lastMark = drainAtEveryMark().at(-1)!
    const rows = drainRowsAt(AT, DRAIN_OWNED)
    const minute = drainForAMinute(lastMark, 20, 4, 48)
    expect(rows.map((row) => [row.rateId, toCanonical(row.unclampedValuePerTrip)])).toEqual([
      ['extraction.mineral_drain', toCanonical(mul(minute, AT.tripMinutes))],
    ])
  })

  it('never reports more than the trip cap of the hold it is asked at', () => {
    const [row] = drainRowsAt({ ...AT, tripMinutes: fromCanonical('30') }, DRAIN_OWNED)
    const cap = tripCapAt(AT.planetIndex, AT.band, AT.cargoCapacity)
    expect(cmp(row.valuePerTrip, cap)).toBeLessThanOrEqual(0)
  })

  it('counts zero while the drain is not owned', () => {
    const unowned = { isRowLive: () => true, isItemOwned: () => false }
    expect(drainRowsAt(AT, unowned)).toEqual([])
  })

  it('is paid through the trip ledger in play, as its rate declares', () => {
    const session = drainSessionAt(standingTileWithOre(5))
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK + 4)
    const yielded = ofType(session.events(), 'extraction.DrainYielded')
      .map((event) => fromCanonical((event as unknown as { value: string }).value))
      .reduce(add, ZERO_MONEY)
    expect(DRAIN_INCOME_RATE.isTripCappedInPlay).toBe(true)
    expect(cmp(yielded, ZERO_MONEY)).toBe(1)
    expect(incomeTripOf(session.state(), 'p1').incomeItemValue).toBe(toCanonical(yielded))
  })
})
