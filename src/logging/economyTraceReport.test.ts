import { describe, expect, it } from 'vitest'
import { fromCanonical, toFixedText, ZERO_MONEY } from '../systems/money'
import { emptyEconomyTrace, type PlanetEconomy, type TripSale } from './economyTrace'
import { economyTraceMarkdownOf, economyTraceMediansOf } from './economyTraceReport'
import {
  economyTraceRowsOf,
  TICKS_PER_MINUTE,
  type EconomyTraceRun,
  type KitHand,
} from './economyTraceRows'

describe('economy trace rows (ticket 907)', () => {
  it('gives each planet its income per minute, upgrades and deaths', () => {
    const [row] = economyTraceRowsOf([runOf(83921, 'off', [planetOf(3, { income: '600' })])])

    expect(row).toMatchObject({
      worldSeed: 83921,
      hand: 'off',
      planet: 3,
      ticks: 2 * TICKS_PER_MINUTE,
    })
    expect(toFixedText(fromCanonical(row.incomePerMinute), 0)).toBe('300')
    expect(row.upgradesBought).toBe(3)
    expect(row.deaths).toBe(2)
    expect(row.deathsByCause).toEqual({ 'hazard.firedamp': 1, fuel: 1 })
  })

  it('times the arrival ask to its cover and counts the asks never covered', () => {
    const [row] = economyTraceRowsOf([runOf(83921, 'off', [planetOf(5, {})])])

    expect(row.arrivalAsk).toMatchObject({ upgradeId: 'hull', waitTicks: 600, isCovered: true })
    expect(row.longestAskWaitTicks).toBe(2 * TICKS_PER_MINUTE - 600)
    expect(row.uncoveredAsks).toBe(1)
  })

  it('groups the trips by deepest band with the middle sale and the rescues', () => {
    const [row] = economyTraceRowsOf([runOf(83921, 'off', [planetOf(2, {})])])

    expect(row.tripsByBand).toEqual([
      { band: 2, trips: 3, rescued: 1, medianSale: '3e+1' },
      { band: 4, trips: 1, rescued: 0, medianSale: '2.5e+2' },
    ])
  })
})

describe('economy trace report (ticket 907)', () => {
  it('takes each planet median over the seeds and sums the deaths by cause', () => {
    const runs = [400, 600, 900].map((income, at) =>
      runOf(at, 'off', [planetOf(4, { income: `${income}` })]),
    )
    const [median] = economyTraceMediansOf(economyTraceRowsOf(runs), 'off')

    expect(toFixedText(median.incomePerMinute, 0)).toBe('300')
    expect(median.seeds).toBe(3)
    expect(median.deathsByCause).toEqual({ 'hazard.firedamp': 3, fuel: 3 })
  })

  it('sets kitPolicy off beside on, planet by planet', () => {
    const runs = [
      runOf(1, 'off', [planetOf(3, { income: '600' })]),
      runOf(1, 'on', [planetOf(3, { income: '1200' })]),
    ]

    expect(economyTraceMarkdownOf(runs, '2026-10-25')).toContain(
      '| P3 | 2.0 / 2.0 | $300 / $600 | 3 / 3 | 2 / 2 |',
    )
  })

  it('prints each band cell as the middle sale with its trips and rescues', () => {
    const markdown = economyTraceMarkdownOf([runOf(1, 'off', [planetOf(2, {})])], '2026-10-25')

    expect(markdown).toContain('| 2 | $30 (3, 1) |')
    expect(markdown).toContain('| 4 | $250 (1, 0) |')
  })
})

function runOf(worldSeed: number, hand: KitHand, planets: PlanetEconomy[]): EconomyTraceRun {
  const trace = emptyEconomyTrace()
  planets.forEach((planet) => trace.planets.set(planet.planet, planet))
  return { worldSeed, hand, trace, endTick: 0 }
}

/** Two minutes on `planet`: three buys, two deaths, two asks (one covered), four trips. */
function planetOf(planet: number, { income = '0' }: { income?: string }): PlanetEconomy {
  const lastTick = 2 * TICKS_PER_MINUTE
  return {
    planet,
    arrivalTick: 0,
    lastTick,
    arrivalWallet: fromCanonical('100'),
    income: fromCanonical(income),
    asks: [
      {
        openTick: 0,
        upgradeId: 'hull',
        price: fromCanonical('50'),
        coveredTick: 600,
        replacedTick: null,
      },
      {
        openTick: 600,
        upgradeId: 'engine',
        price: fromCanonical('90'),
        coveredTick: null,
        replacedTick: null,
      },
    ],
    upgrades: new Map([
      ['hull', 2],
      ['casing', 1],
    ]),
    deaths: new Map([
      ['hazard.firedamp', 1],
      ['fuel', 1],
    ]),
    trips: [trip(2, '30'), trip(2, '40'), trip(2, '0', true), trip(4, '250')].reverse(),
  }
}

function trip(band: number, value: string, isRescued = false): TripSale {
  return { band, value: isRescued ? ZERO_MONEY : fromCanonical(value), isRescued }
}
