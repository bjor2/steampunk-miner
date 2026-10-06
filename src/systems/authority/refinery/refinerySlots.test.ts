import { describe, expect, it } from 'vitest'
import { oreTier } from '../../economy/oreEconomy'
import { refinedValue } from '../../economy/refineryEconomy'
import { add, sub, toCanonical } from '../../money'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, mineTile, surfaceOreTiles, WORLD_SEED } from '../scriptedSession'
import { setPlanetCommand, setPlanetSeedCommand } from '../../startScenarioCommands'
import {
  REFINERY_PARAMS,
  REFINERY_SITE,
  dockAtBayOf,
  poseInBayOf,
  sessionOnPlanet,
} from './refineryFixtures'

const TIER = oreTier(3, 1)
const REFINE_TICKS = 180 * 60
const buySlot = { type: 'buyRefinerySlot', payload: {} } as const
const collect = { type: 'collectRefined', payload: {} } as const
const queue = (units: number) =>
  ({ type: 'queueRefine', payload: { resourceTier: TIER, units } }) as const
const setUpgrade = (upgradeId: string, level: number) =>
  ({ type: 'debug.setUpgrade', payload: { upgradeId, level } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')
const eventOf = (events: readonly DomainEvent[], type: DomainEvent['type']) =>
  events.find((event) => event.type === type)

describe('refinery slots', () => {
  it('sells slot 2 for 20 and slot 3 for 40 band-5 ore units of planet 3, then no more', () => {
    const session = sessionOnPlanet(3, '1e30')
    dockAtBayOf(session, 1, REFINERY_SITE, 'refinery')
    expect(eventOf(session.submit(2, buySlot), 'RefinerySlotBought')).toEqual(
      expect.objectContaining({ slots: 2, price: '1.6146211e+4' }),
    )
    expect(eventOf(session.submit(3, buySlot), 'RefinerySlotBought')).toEqual(
      expect.objectContaining({ slots: 3, price: '3.2292422e+4' }),
    )
    expect(rejectionOf(session.submit(4, buySlot))).toMatchObject({ reason: 'slots_max' })
    expect(session.state().platform.refinerySlots).toEqual([null, null, null])
  })

  it('refuses a slot the wallet cannot pay', () => {
    const session = sessionOnPlanet(3, '100')
    dockAtBayOf(session, 1, REFINERY_SITE, 'refinery')
    expect(rejectionOf(session.submit(2, buySlot))).toMatchObject({ reason: 'money_short' })
  })
})

describe('refinery in co-op', () => {
  /** Two players on planet 3 with on-curve drills, each with band-1 ore, both at the Refinery bay. */
  function twoMinersAtRefinery() {
    const session = createScriptedSession(['p1', 'p2'])
    session.submit(0, setPlanetCommand(3))
    session.submit(0, setPlanetSeedCommand(WORLD_SEED))
    for (const playerId of ['p1', 'p2']) {
      session.submit(0, setUpgrade('drill_power', 25), playerId)
      session.submit(0, setUpgrade('drill_tip', 13), playerId)
    }
    const tiles = surfaceOreTiles(4, REFINERY_PARAMS)
    tiles.slice(0, 2).forEach((tile, index) => mineTile(session, 10 + 50 * index, tile, 'p1'))
    tiles.slice(2).forEach((tile, index) => mineTile(session, 200 + 50 * index, tile, 'p2'))
    for (const playerId of ['p1', 'p2']) {
      session.submit(400, poseInBayOf(REFINERY_SITE, 'refinery'), playerId)
      session.submit(400, { type: 'dock', payload: { bay: 'refinery' } }, playerId)
    }
    return session
  }

  it('shares the slots first come first served', () => {
    const session = twoMinersAtRefinery()
    session.submit(401, queue(2), 'p1')
    expect(rejectionOf(session.submit(402, queue(2), 'p2'))).toMatchObject({ reason: 'slots_busy' })
  })

  it("pays a batch only to the player who queued it, and never collects another's", () => {
    const session = twoMinersAtRefinery()
    session.submit(401, queue(2), 'p1')
    const ready = 401 + REFINE_TICKS
    for (const playerId of ['p1', 'p2']) {
      session.submit(ready, { type: 'undock', payload: {} }, playerId)
      session.submit(ready, poseInBayOf(REFINERY_SITE, 'sell'), playerId)
      session.submit(ready, { type: 'dock', payload: { bay: 'sell' } }, playerId)
    }
    expect(rejectionOf(session.submit(ready + 1, collect, 'p2'))).toMatchObject({
      reason: 'nothing_to_collect',
    })
    const p1Before = session.state().players.p1.wallet
    // Scripted mining lines its tiles (#115), and the payout settles that lining bill (#128).
    const p1Bill = session.vehicle('p1').liningBill
    session.submit(ready + 2, collect, 'p1')
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(add(p1Before, refinedValue(TIER, 2)), p1Bill)),
    )
  })
})
