import { describe, expect, it } from 'vitest'
import { fromCanonical, ZERO_MONEY } from '../../../systems/money'
import {
  deliveredShareTableOf,
  deliveredShareVerdictsOf,
  type PlanetDelivery,
} from './deliveredIncomeShares'
import type { IncomeCap } from './treeEconomy'

// The Vertical Scaler's guard on the #385 cap: each income item's share of what the bot earned on
// a planet over its whole stay, on the median of the seeds that stood there.

const CAP: IncomeCap = { maxShareBp: 1500, planets: [10], knownRed: {} }

function planetOf(planetIndex: number, earned: string, delivered: Record<string, string> = {}) {
  const deliveredByItem = new Map(
    Object.entries(delivered).map(([itemId, value]) => [itemId, fromCanonical(value)]),
  )
  const planet: PlanetDelivery = { planetIndex, earned: fromCanonical(earned), deliveredByItem }
  return planet
}

describe('delivered income shares', () => {
  it('passes an item that brought 15% of what the planet earned and fails one past it', () => {
    const seed = [planetOf(9, '1000', { 'power.drain': '150', 'power.siphon': '151' })]
    const verdicts = deliveredShareVerdictsOf([seed], CAP)
    expect(verdicts.map((v) => [v.itemId, v.medianShareBp, v.isOverCap])).toEqual([
      ['power.drain', 1500, false],
      ['power.siphon', 1510, true],
    ])
  })

  it('counts a seed that stood on the planet without the item as 0 toward the median', () => {
    const seeds = [
      [planetOf(9, '1000', { 'power.drain': '900' })],
      [planetOf(9, '1000')],
      [planetOf(9, '1000')],
      [planetOf(12, '1000', { 'power.drain': '900' })],
    ]
    const onNine = deliveredShareVerdictsOf(seeds, CAP).filter((v) => v.planetIndex === 9)
    expect(onNine.map((v) => [v.seedShareBps, v.medianShareBp, v.isOverCap])).toEqual([
      [[9000, 0, 0], 0, false],
    ])
  })

  it('reads an item that delivered with nothing sold as the whole of the planet', () => {
    const seed = [{ ...planetOf(9, '0', { 'power.drain': '5' }), earned: ZERO_MONEY }]
    expect(deliveredShareVerdictsOf([seed], CAP).map((v) => v.medianShareBp)).toEqual([10_000])
  })

  it('judges no planet where no item delivered, and prints so', () => {
    const verdicts = deliveredShareVerdictsOf([[planetOf(3, '50')]], CAP)
    expect(verdicts).toEqual([])
    expect(deliveredShareTableOf(verdicts)).toBe('income items delivered nothing on any planet')
  })

  it('prints each planet and item with its median and seed shares', () => {
    const seed = [planetOf(9, '1000', { 'power.siphon': '151' })]
    expect(deliveredShareTableOf(deliveredShareVerdictsOf([seed], CAP))).toContain(
      '| P9 | power.siphon | 15.10% | 15.10% | over the cap |',
    )
  })
})
