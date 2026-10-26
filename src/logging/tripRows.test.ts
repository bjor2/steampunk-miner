import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical } from '../systems/money'
import { emptyEconomyTrace } from './economyTrace'
import { TICKS_PER_MINUTE, type EconomyTraceRun } from './economyTraceRows'
import type { TripEndCause } from './tripEndCause'
import { emptyTripFold, type TripRecord } from './tripFold'
import { tripMarkdownOf, tripRowsOf } from './tripRows'

describe('per-trip rows (ticket 918)', () => {
  it('writes one row per trip with its seed, hand, length and money as a canonical string', () => {
    const rows = tripRowsOf([runOf([tripOf('hold_full', 0, 3)])])

    expect(rows).toEqual([
      {
        worldSeed: 83921,
        hand: 'off',
        planet: 1,
        startTick: 0,
        endTick: 3 * TICKS_PER_MINUTE,
        ticks: 3 * TICKS_PER_MINUTE,
        endCause: 'hold_full',
        deepestBand: 2,
        cellsCut: 12,
        sellValue: toCanonical(fromCanonical('40')),
        fuelUsedQuanta: 900,
      },
    ])
  })

  it('leaves crate drops out of the trips home, and voluntary sells out of the floor too', () => {
    const run = runOf([
      tripOf('hold_full', 0, 2),
      tripOf('cache_crate', 10, 1),
      tripOf('voluntary_sell', 20, 4),
      tripOf('death', 30, 9),
    ])
    const markdown = tripMarkdownOf(tripRowsOf([run]), '2026-10-26')

    expect(markdown).toContain(
      '| off | 83921 | 1 | 3 | 2 | 4.0 | 9.0 | hold_full 1, death 1, voluntary_sell 1, cache_crate 1 |',
    )
  })
})

function runOf(trips: TripRecord[]): EconomyTraceRun {
  const fold = emptyTripFold()
  fold.trips.push(...trips)
  return { worldSeed: 83921, hand: 'off', trace: emptyEconomyTrace(), trips: fold, endTick: 0 }
}

/** A trip on planet 1 starting at `startMinute`, `minutes` long. */
function tripOf(endCause: TripEndCause, startMinute: number, minutes: number): TripRecord {
  const startTick = startMinute * TICKS_PER_MINUTE
  return {
    planet: 1,
    startTick,
    endTick: startTick + minutes * TICKS_PER_MINUTE,
    endCause,
    deepestBand: 2,
    cellsCut: 12,
    sellValue: fromCanonical('40'),
    fuelUsedQuanta: 900,
  }
}
