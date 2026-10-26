import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  chargedLengthMmOf,
  DOWN,
  DOWN_RIGHT,
  LEG_MM,
  pointAlong,
  sweptLegAlong,
} from '../systems/authority/casingAimFixtures'
import type { DomainEvent } from '../systems/authority/domainEvent'

// Ticket 833's unit-level billing check (the GD's ruling of 25 Oct on #833, in place of the
// diagonal-heavy bot run moved to #899): a trail that is all 45 degrees is billed per metre along
// its aim at the vertical shaft's metre price, with no angle multiplier (the HS's condition 1), and
// its lining stays at or under 6% of a recorded run's spend. The recorded run is the bot scenario's
// balance baseline (`tests/balance/bot-slice.summary.json`, the pacing seed's run). It predates
// #894's casing prices, so the band in force for it is the 6% one (#899's reading); a baseline
// re-recorded at #894's prices is judged by #829's lining row, at most 6% of spend, the part of
// casing an angle can move.

const BASELINE_FILE = new URL('../../tests/balance/bot-slice.summary.json', import.meta.url)
const LINING_SHARE_CAP_BP = 600
const BASIS_POINTS = 10_000

/** The recorded run's spend and the lining it paid at the Sell bay, in money. */
interface RecordedSpend {
  moneySpent: number
  liningSpending: number
}

function readRecordedSpend(): RecordedSpend {
  const { moneySpent, liningSpending } = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  return { moneySpent, liningSpending }
}

type CasingLined = Extract<DomainEvent, { type: 'CasingLined' }>

function liningRingsOf(events: readonly DomainEvent[]): CasingLined[] {
  return events.filter((event): event is CasingLined => event.type === 'CasingLined')
}

/** What a ring of this band, length and type is billed: the same on any aim with no multiplier. */
function priceKeyOf({ band, lengthMm, liningType }: CasingLined): string {
  return `${band}:${lengthMm}:${liningType}`
}

/** The tunnel axis billed per metre the leg descends, the path a 45 degree trail pays per depth. */
function billedPerDescentOf(rings: readonly CasingLined[]): number {
  const descentMm = Math.abs(pointAlong(DOWN_RIGHT, LEG_MM).yMm - pointAlong(DOWN_RIGHT, 0).yMm)
  return chargedLengthMmOf(rings) / descentMm
}

/** The run's lining share of spend with its trail dug all at 45 degrees to the same depths, bp. */
function diagonalLiningShareBp(recorded: RecordedSpend, billedPerDescent: number): number {
  const diagonalLining = recorded.liningSpending * billedPerDescent
  const spend = recorded.moneySpent - recorded.liningSpending + diagonalLining
  return Math.round((diagonalLining * BASIS_POINTS) / spend)
}

describe('diagonal casing bill (ticket 833)', () => {
  it('bills every ring of a 45 degree leg at the straight shaft’s price for its band and length', () => {
    const diagonal = liningRingsOf(sweptLegAlong(DOWN_RIGHT).events())
    const straight = liningRingsOf(sweptLegAlong(DOWN).events())
    const straightPrices = new Map(straight.map((ring) => [priceKeyOf(ring), ring.price]))
    const comparable = diagonal.filter((ring) => straightPrices.has(priceKeyOf(ring)))
    expect(comparable).toHaveLength(diagonal.length)
    for (const ring of comparable) expect(ring.price).toBe(straightPrices.get(priceKeyOf(ring)))
  })

  it('bills a 45 degree trail its path, about 1.41 m of lining a metre of depth', () => {
    const rings = liningRingsOf(sweptLegAlong(DOWN_RIGHT).events())
    expect(billedPerDescentOf(rings)).toBeGreaterThan(1.3)
    expect(billedPerDescentOf(rings)).toBeLessThan(1.5)
  })

  it('keeps a trail all at 45 degrees at or under 6% of the recorded run’s spend', () => {
    const rings = liningRingsOf(sweptLegAlong(DOWN_RIGHT).events())
    const shareBp = diagonalLiningShareBp(readRecordedSpend(), billedPerDescentOf(rings))
    expect(shareBp).toBeGreaterThan(0)
    expect(shareBp).toBeLessThanOrEqual(LINING_SHARE_CAP_BP)
  })
})
