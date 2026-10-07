import { describe, expect, it } from 'vitest'
import { chargePrice } from '../systems/economy/chargeSizes'
import { add, cmp, div, fromCanonical } from '../systems/money'
import { dynamitePaybackOf, gateClearsByPlanet, gateClearsOn } from './gateClearTally'
import type { RunEvent } from './runEvent'

// The bot's gate clears per planet (ticket 237): a charge's price counts once, against the first
// gated cell its blast freed, and extractor clears count apart.

function line(event: string, planet: number, data: Record<string, unknown>): RunEvent {
  return { event, planet, data, tick: 0, seq: 0 } as unknown as RunEvent
}

const cleared = (planet: number, method: string, value: string) =>
  line('mining-gates.gate_cleared', planet, { gateKind: method, method, value })

describe('gate clear tally', () => {
  it('prices each charge once against the gated cells its blast freed', () => {
    const tally = gateClearsByPlanet([
      line('charge_detonated', 7, { size: 2 }),
      cleared(7, 'dynamite', '100'),
      cleared(7, 'dynamite', '50'),
      line('charge_detonated', 7, { size: 1 }),
      line('charge_detonated', 7, { size: 1 }),
      cleared(7, 'dynamite', '10'),
    ])
    const spend = add(chargePrice(2, 1, 7), chargePrice(1, 1, 7))
    expect(gateClearsOn(tally, 7)).toMatchObject({ dynamiteClears: 3 })
    expect(cmp(gateClearsOn(tally, 7).dynamiteValue, fromCanonical('160'))).toBe(0)
    expect(cmp(gateClearsOn(tally, 7).dynamiteSpend, spend)).toBe(0)
    expect(cmp(dynamitePaybackOf(gateClearsOn(tally, 7))!, div(fromCanonical('160'), spend))).toBe(
      0,
    )
  })

  it('counts no blasted drill-gated signature as a dynamite clear', () => {
    const tally = gateClearsByPlanet([
      line('charge_detonated', 7, { size: 1 }),
      line('mining-gates.gate_cleared', 7, { gateKind: 'drill', method: 'dynamite', value: '9' }),
    ])
    expect(gateClearsOn(tally, 7).dynamiteClears).toBe(0)
  })

  it('counts extractor clears apart, with no payback for a planet no charge freed', () => {
    const tally = gateClearsByPlanet([cleared(12, 'rig', '7'), cleared(12, 'rig', '8')])
    expect(gateClearsOn(tally, 12)).toMatchObject({ extractorClears: 2, dynamiteClears: 0 })
    expect(cmp(gateClearsOn(tally, 12).extractorValue, fromCanonical('15'))).toBe(0)
    expect(dynamitePaybackOf(gateClearsOn(tally, 12))).toBeNull()
    expect(gateClearsOn(tally, 40).extractorClears).toBe(0)
  })
})
