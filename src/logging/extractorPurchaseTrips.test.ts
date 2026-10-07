import { describe, expect, it } from 'vitest'
import {
  extractorPurchaseRowsOf,
  extractorPurchasesOf,
  extractorPurchaseTableOf,
  extractorPurchaseWarnings,
  type ExtractorOnSale,
} from './extractorPurchaseTrips'
import type { RunEvent } from './runEvent'

// When the bot bought each extractor (ticket 296, #142 acceptance 7): the trips it had ended on
// the planet of the purchase, a trip ending at the Sell bay, and a seed on time when it bought on
// the extractor's own planet by the end of trip 4.

function line(event: string, planet: number, data: Record<string, unknown>): RunEvent {
  return { event, planet, data, tick: 0, seq: 0 } as unknown as RunEvent
}

const FORK: ExtractorOnSale = { id: 'rig.resonance', planet: 5 }
const HOOD: ExtractorOnSale = { id: 'rig.containment', planet: 12 }

const tripEnd = (planet: number) => line('dock_entered', planet, { bay: 'sell' })
const upgradeBay = (planet: number) => [
  line('dock_left', planet, { bay: 'sell' }),
  line('dock_entered', planet, { bay: 'upgrade' }),
]
const bought = (planet: number, itemId: string) =>
  line('vehicle_item_purchased', planet, { itemId, price: '1' })

/** `trips` trips on the planet, each with a drive to the Upgrade bay after it. */
const tripsOn = (planet: number, trips: number) =>
  Array.from({ length: trips }, () => [tripEnd(planet), ...upgradeBay(planet)]).flat()

describe('extractor purchase trips', () => {
  it('counts the trips ended at the Sell bay on the planet, never a drive between bays', () => {
    const purchases = extractorPurchasesOf(
      [...tripsOn(4, 9), ...tripsOn(5, 3), bought(5, FORK.id), bought(5, 'gear.other')],
      [FORK, HOOD],
    )
    expect([...purchases]).toEqual([[FORK.id, { planet: 5, tripsBefore: 3 }]])
  })

  it('judges a seed on time on its own planet by trip 4, and late, elsewhere or never not', () => {
    const rows = extractorPurchaseRowsOf(
      [
        extractorPurchasesOf([...tripsOn(5, 4), bought(5, FORK.id)], [FORK]),
        extractorPurchasesOf([...tripsOn(5, 5), bought(5, FORK.id)], [FORK]),
        extractorPurchasesOf([...tripsOn(5, 1), bought(6, FORK.id)], [FORK]),
        new Map(),
      ],
      [FORK],
    )
    expect(extractorPurchaseTableOf(rows, [1, 2, 3, 4])).toContain(
      '| rig.resonance | 5 | after trip 4 | after trip 5 | planet 6 | never | no |',
    )
    expect(extractorPurchaseWarnings(rows)).toEqual([
      'rig.resonance: not bought on planet 5 by trip 4 on every seed',
    ])
  })

  it('warns of nothing when every seed buys every extractor on time', () => {
    const run = [...tripsOn(5, 2), bought(5, FORK.id), ...tripsOn(12, 0), bought(12, HOOD.id)]
    const rows = extractorPurchaseRowsOf([extractorPurchasesOf(run, [FORK, HOOD])], [FORK, HOOD])
    expect(extractorPurchaseWarnings(rows)).toEqual([])
  })
})
