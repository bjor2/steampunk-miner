import { describe, expect, it } from 'vitest'
import { chargePrice } from '../systems/economy/chargeSizes'
import { fromCanonical, mul, toCanonical } from '../systems/money'
import { gateClearRowsOf, gateClearWarnings, type DynamiteCensus } from './gateClearTables'
import type { PlanetGateClears } from './gateClearTally'

// The bot's gate clears judged over the seeds (ticket 237, its GD ruling of 7 Oct): dynamite
// medians over only the seeds with dynamite cells, judged from two such seeds, the payback and
// the extractor clears reported, and a warning per judged median under the bar, per dry dynamite
// act and for a short coverage.

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

function census(planet: number, tilesBySeed: number[], isDynamiteAct = true): DynamiteCensus {
  return { planet, isDynamiteAct, tilesBySeed }
}

/** Four planets judged, one from planet 28 on, each at the bar: the coverage holds. */
const COVERED = [7, 10, 16, 34].map((planet) => census(planet, [5, 5, 5]))
const AT_THE_BAR = [0, 1, 2].map(
  () => new Map(COVERED.map(({ planet }) => [planet, clears(2, '3', 0)])),
)

describe('gate clear tables', () => {
  it('takes the medians over the seeds, leaving a seed with no shell out of the payback', () => {
    const [row] = gateClearRowsOf(
      [
        new Map([[7, clears(2, '3', 1)]]),
        new Map([[7, clears(0, '0', 2)]]),
        new Map([[7, clears(4, '1', 5)]]),
      ],
      [census(7, [5, 5, 5])],
    )
    expect(row).toMatchObject({ judgement: 'judged', dynamiteMedian: 2, extractorMedian: 2 })
    expect(row.paybackBySeed[1]).toBeNull()
    expect(Number(toCanonical(row.paybackMedian!))).toBeCloseTo(2)
  })

  it('works the dynamite median out over only the seeds with dynamite cells', () => {
    const [row] = gateClearRowsOf(
      [new Map([[7, clears(2, '3', 0)]]), new Map(), new Map([[7, clears(3, '3', 0)]])],
      [census(7, [5, 0, 8])],
    )
    expect(row.dynamiteBySeed).toEqual([2, null, 3])
    expect(row).toMatchObject({ judgement: 'judged', dynamiteMedian: 2.5 })
  })

  it('judges no planet with dynamite cells on one seed or none, and warns of neither', () => {
    const rows = gateClearRowsOf(
      [new Map(), new Map(), new Map()],
      [census(22, [4, 0, 0], false), census(28, [0, 0, 0], false)],
    )
    expect(rows.map((row) => row.judgement)).toEqual(['insufficient sample', 'no dynamite cells'])
    expect(gateClearWarnings([...gateClearRowsOf(AT_THE_BAR, COVERED), ...rows])).toEqual([])
  })

  it('warns for a judged median under the bar and never for the payback or the extractors', () => {
    const rows = gateClearRowsOf([new Map(), new Map(), new Map()], COVERED)
    expect(gateClearWarnings(rows)).toEqual(
      COVERED.map(
        ({ planet }) =>
          `planet ${planet}: the bot freed a median of 0 shells a run over the seeds with dynamite cells`,
      ),
    )
  })

  it('flags a dynamite act with no dynamite cells on any seed as a content finding', () => {
    const rows = gateClearRowsOf(AT_THE_BAR, [...COVERED, census(46, [0, 0, 0])])
    expect(gateClearWarnings(rows)).toEqual([
      'planet 46: a dynamite act with no dynamite cells on any seed (a content finding for Content and Planet)',
    ])
  })

  it('warns when fewer than four planets are judged or none from planet 28 on', () => {
    const early = COVERED.slice(0, 3)
    expect(gateClearWarnings(gateClearRowsOf(AT_THE_BAR, early))).toEqual([
      'only 3 planets judged for dynamite (4 wanted)',
      'no planet from 28 on judged for dynamite',
    ])
  })
})
