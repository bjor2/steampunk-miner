import { describe, expect, it } from 'vitest'
import { createScriptedSession, typesOf } from '../../systems/authority/scriptedSession'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { haulPlanProblems, haulScriptOf, type HaulPlan } from './debugHaul'

const SELL_ALL = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

/** Plays the script as `fastForward` would, from a fresh planet-1 session, then sells. */
function haulAndSell(legs: HaulPlan): DomainEvent[] {
  const session = createScriptedSession()
  const { commands, endTick } = haulScriptOf(legs, 1)
  const played = commands.flatMap(({ tick, ...intent }) => session.submit(tick, intent as never))
  return [...played, ...session.submit(endTick + 1, SELL_ALL)]
}

describe('sell burst haul scripts', () => {
  it('mines, docks at the Exchange, and the sale then pays the lining bill', () => {
    const events = haulAndSell([{ planet: 1, tiles: 4 }])
    expect(typesOf(events)).not.toContain('CommandRejected')
    expect(typesOf(events).slice(-2)).toEqual(['ResourceSold', 'LiningSettled'])
  })

  it('carries a haul across planets, so two tiers can be sold as two sales', () => {
    const events = haulAndSell([
      { planet: 1, tiles: 2 },
      { planet: 2, tiles: 2 },
    ])
    const sold = events.find((event) => event.type === 'ResourceSold')
    expect(sold?.type === 'ResourceSold' ? sold.items.map((item) => item.tier) : []).toEqual([1, 4])
  })

  it("mines planet 8's surface ore, worth a 40-coin sale with the flare", () => {
    const sold = haulAndSell([{ planet: 8, tiles: 4 }]).find(
      (event) => event.type === 'ResourceSold',
    )
    expect(sold?.type === 'ResourceSold' ? sold.coinsShown : 0).toBe(40)
  })

  it('refuses a plan with every problem listed', () => {
    expect(
      haulPlanProblems([
        { planet: 0, tiles: 4 },
        { planet: 1, tiles: 99 },
      ]),
    ).toHaveLength(2)
    expect(haulPlanProblems([])).toHaveLength(1)
    expect(haulPlanProblems([{ planet: 1, tiles: 4 }])).toEqual([])
  })
})
