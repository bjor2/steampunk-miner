import { describe, expect, it } from 'vitest'
import { chargePrice } from '../systems/economy/chargeSizes'
import { fromCanonical, mul, toCanonical } from '../systems/money'
import { gateClearRowsOf, gateClearWarnings, isPaybackMet } from './gateClearTables'
import type { PlanetGateClears } from './gateClearTally'

// The bot's gate clears judged over the seeds (ticket 237): medians of clears and of payback, a
// seed with no blasted shell sitting out of the payback median, and a warning per missed floor.

function clears(dynamite: number, valueTimesPrice: string, extractor: number): PlanetGateClears {
  const spend = chargePrice(1, 1, 7)
  return {
    dynamiteClears: dynamite,
    dynamiteValue: mul(spend, fromCanonical(valueTimesPrice)),
    dynamiteSpend: dynamite === 0 ? fromCanonical('0') : spend,
    extractorClears: extractor,
    extractorValue: fromCanonical('0'),
  }
}

describe('gate clear tables', () => {
  it('takes the medians over the seeds, leaving a seed with no shell out of the payback', () => {
    const [row] = gateClearRowsOf(
      [
        new Map([[7, clears(2, '3', 1)]]),
        new Map([[7, clears(0, '0', 2)]]),
        new Map([[7, clears(4, '1', 5)]]),
      ],
      [7],
    )
    expect(row).toMatchObject({ dynamiteMedian: 2, extractorMedian: 2 })
    expect(row.paybackBySeed[1]).toBeNull()
    expect(Number(toCanonical(row.paybackMedian!))).toBeCloseTo(2)
    expect(isPaybackMet(row.paybackMedian)).toBe(true)
    expect(gateClearWarnings([row])).toEqual([])
  })

  it('warns for every median under its floor, a planet with no seed blasting included', () => {
    const rows = gateClearRowsOf([new Map(), new Map(), new Map()], [22])
    expect(gateClearWarnings(rows)).toEqual([
      'planet 22: the bot freed a median of 0 shells a run',
      'planet 22: dynamite paid back - (median)',
      'planet 22: the bot freed a median of 0 extractor cells a run',
    ])
  })
})
