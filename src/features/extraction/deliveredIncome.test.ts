import { describe, expect, it } from 'vitest'
import type { RunEvent } from '../../logging/runEvent'
import { fromCanonical, toCanonical } from '../../systems/money'
import { startDeliveredIncomeFold } from './deliveredIncome'
import { DRAIN_YIELD_EVENT } from './logging'

// What the income items actually delivered per planet (#385, Vertical Scaler guard): the
// `drain_yield` values by item beside the money each planet earned, folded as the lines pass.

/** The fields the fold reads of a line; the rest of the envelope does not matter here. */
function lineOf(planet: number, event: string, data: Record<string, unknown>): RunEvent {
  return { planet, event, data } as unknown as RunEvent
}

const sold = (planet: number, value: string) =>
  lineOf(planet, 'resource_sold', { items: [], value, mode: 'all', coinsShown: 0 })
const refined = (planet: number, value: string) => lineOf(planet, 'refine_collected', { value })
const drained = (planet: number, itemId: string, value: string) =>
  lineOf(planet, DRAIN_YIELD_EVENT, {
    itemId,
    value,
    tripCapFraction: '0',
    band: 1,
    cells: 1,
    units: 1,
  })

/** `amount` as the fold's money reads in canonical text. */
const canonical = (amount: string) => toCanonical(fromCanonical(amount))

function planetsAsText(lines: readonly RunEvent[]) {
  const fold = startDeliveredIncomeFold()
  lines.forEach((line) => fold.add(line))
  return fold.planets().map((planet) => ({
    planetIndex: planet.planetIndex,
    earned: toCanonical(planet.earned),
    delivered: Object.fromEntries(
      [...planet.deliveredByItem].map(([itemId, value]) => [itemId, toCanonical(value)]),
    ),
  }))
}

describe('delivered income', () => {
  it('sums each planet’s sales and refined batches as the money it earned', () => {
    expect(planetsAsText([sold(2, '100'), refined(2, '50'), sold(3, '7')])).toEqual([
      { planetIndex: 2, earned: canonical('150'), delivered: {} },
      { planetIndex: 3, earned: canonical('7'), delivered: {} },
    ])
  })

  it('sums what each income item delivered on the planet it delivered on', () => {
    const lines = [
      drained(9, 'power.mineral_drain', '4'),
      drained(9, 'power.mineral_drain', '6'),
      drained(9, 'power.slurry_siphon', '1'),
      sold(9, '200'),
    ]
    expect(planetsAsText(lines)).toEqual([
      {
        planetIndex: 9,
        earned: canonical('200'),
        delivered: {
          'power.mineral_drain': canonical('10'),
          'power.slurry_siphon': canonical('1'),
        },
      },
    ])
  })

  it('reads nothing from other lines', () => {
    expect(planetsAsText([lineOf(4, 'planet_entered', { value: '9' })])).toEqual([])
  })
})
