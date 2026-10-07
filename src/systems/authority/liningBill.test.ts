import { describe, expect, it } from 'vitest'
import { oreTier } from '../economy/oreEconomy'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY, type Money } from '../money'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { withVehicle } from './authorityState'
import { digTenMetresUntil } from './casingDigFixtures'
import type { DomainEvent } from './domainEvent'
import { payLiningBillOutOf } from './liningBill'
import { serviceQuote } from './platformServices'
import {
  dockAtBayOf,
  mineSurfaceOre,
  REFINERY_PLANET,
  REFINERY_SITE,
} from './refinery/refineryFixtures'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import {
  continueScriptedSession,
  createScriptedSession,
  dockInBay,
  mineTile,
  PARAMS,
  surfaceOreTiles,
  typesOf,
  WORLD_SEED,
  type ScriptedSession,
} from './scriptedSession'

const SELL_ALL = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const
const sellTier = (resourceTier: number) =>
  ({ type: 'sellCargo', payload: { resourceTier } }) as const
const UNDOCK = { type: 'undock', payload: {} } as const

/** 180 s of refining at 60 ticks a second (#105). */
const REFINE_TICKS = 180 * 60

const DRILL_FOR_LATER_PLANETS = [
  { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 250 } },
  { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 130 } },
] as const

/** Planet 2's surface ore is tier 4 (#6: t = 3(p-1) + b), worth 33.75 a unit against tier 1's 10. */
const PLANET_2 = planetParamsFor(WORLD_SEED, 2)
const RICH_TIER = 4

const settledOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'LiningSettled')

/** A 10 m dig with `money` in the wallet, then three surface ore tiles mined for something to sell. */
function digAndMine(money: string): { session: ScriptedSession; tick: number } {
  const { session, end } = digTenMetresUntil(1, money)
  surfaceOreTiles(3).forEach((tile, index) => mineTile(session, end + 100 * (index + 1), tile))
  return { session, tick: end + 500 }
}

function sellAllAtTheSellBay(session: ScriptedSession, tick: number): DomainEvent[] {
  dockInBay(session, tick, 'sell')
  return session.submit(tick, SELL_ALL)
}

/** Undocks when docked (after a tow) and mines one surface ore tile. */
function mineOneOreTile(session: ScriptedSession, tick: number, index: number): void {
  if (session.vehicle().mode === 'docked') session.submit(tick, UNDOCK)
  mineTile(session, tick, surfaceOreTiles(index + 1)[index])
}

function walletOf(session: ScriptedSession) {
  return session.state().players.p1.wallet
}

/**
 * The same session with `bill` of lining on the vehicle: a 10 m dig bills under 1 at today's
 * `k_casing`, so a bill larger than a cheap sale is set here rather than dug for hundreds of metres.
 */
function carryingBill(session: ScriptedSession, bill: string): ScriptedSession {
  const state = session.state()
  const vehicle = { ...session.vehicle(), liningBill: fromCanonical(bill) }
  return continueScriptedSession(withVehicle(state, 'p1', vehicle))
}

/**
 * Docked at planet 2's Sell bay with 2 tier-1 units (20) and 2 tier-4 units (67.5) in the hold and
 * `bill` of lining on the vehicle; `tick` is the dock's.
 */
function docked(bill: string): { session: ScriptedSession; tick: number } {
  const session = createScriptedSession()
  const mined = mineSurfaceOre(session, 1, 2, PARAMS)
  session.submit(mined, setPlanetCommand(2))
  session.submit(mined, setPlanetSeedCommand(WORLD_SEED))
  DRILL_FOR_LATER_PLANETS.forEach((command) => session.submit(mined, command))
  const tick = mineSurfaceOre(session, mined + 1, 2, PLANET_2)
  dockAtBayOf(session, tick, dockSiteOf(PLANET_2), 'sell')
  return { session: carryingBill(session, bill), tick }
}

/** A `LiningSettled` as logged, its amounts canonical. */
function settlement(billed: string, paid: string, forgiven: string) {
  const canonical = (amount: string) => toCanonical(fromCanonical(amount))
  return expect.objectContaining({
    type: 'LiningSettled',
    billed: canonical(billed),
    paid: canonical(paid),
    forgiven: canonical(forgiven),
  })
}

/** On planet 3, four band-1 units refined and ready, docked at the Sell bay; `tick` is after. */
function refinedBatchReadyAtTheSellBay(): { session: ScriptedSession; tick: number } {
  const session = createScriptedSession()
  session.submit(0, setPlanetCommand(REFINERY_PLANET))
  session.submit(0, setPlanetSeedCommand(WORLD_SEED))
  DRILL_FOR_LATER_PLANETS.forEach((command) => session.submit(0, command))
  const mined = mineSurfaceOre(session, 10, 4)
  dockAtBayOf(session, mined, REFINERY_SITE, 'refinery')
  const queue = { resourceTier: oreTier(REFINERY_PLANET, 1), units: 4 }
  session.submit(mined + 1, { type: 'queueRefine', payload: queue })
  dockAtBayOf(session, mined + 1 + REFINE_TICKS, REFINERY_SITE, 'sell')
  return { session, tick: mined + 2 + REFINE_TICKS }
}

function totalOf(events: readonly DomainEvent[], field: 'paid' | 'forgiven'): Money {
  return settledOf(events).reduce((sum, event) => add(sum, fromCanonical(event[field])), ZERO_MONEY)
}

describe('lining bill (#76 amendment, #115)', () => {
  it('settles the whole bill out of the next sale, before the payout reaches the wallet', () => {
    const { session, tick } = digAndMine('1000')
    // Driving onto the pad lays the dig's last rings, so the bill is read once docked.
    dockInBay(session, tick, 'sell')
    const billed = session.vehicle().liningBill
    const wallet = walletOf(session)
    const value = serviceQuote(session.state(), 'p1').saleValue
    const sale = session.submit(tick, SELL_ALL)
    expect(typesOf(sale)).toEqual(['ResourceSold', 'LiningSettled'])
    expect(sale[1]).toMatchObject({
      billed: toCanonical(billed),
      paid: toCanonical(billed),
      forgiven: toCanonical(ZERO_MONEY),
    })
    expect(toCanonical(walletOf(session))).toBe(toCanonical(sub(add(wallet, value), billed)))
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(ZERO_MONEY))
  })

  it('charges a vehicle that dives with an empty wallet the same lining as one with savings', () => {
    const broke = digAndMine('0')
    const saving = digAndMine('1000')
    const brokeSale = settledOf(sellAllAtTheSellBay(broke.session, broke.tick))
    const savingSale = settledOf(sellAllAtTheSellBay(saving.session, saving.tick))
    expect(brokeSale).toHaveLength(1)
    expect(fromCanonical(brokeSale[0].paid)).not.toEqual(ZERO_MONEY)
    expect(brokeSale).toEqual(savingSale)
  })

  it('logs nothing for a payout with no bill', () => {
    const { session, tick } = digAndMine('0')
    sellAllAtTheSellBay(session, tick)
    const settled = payLiningBillOutOf(session.state(), 'p1', fromCanonical('10'))
    expect(settled.events).toEqual([])
    expect(settled.state).toBe(session.state())
  })

  it('keeps the bill through a rescue tow and settles it at the next sale', () => {
    const { session, end } = digTenMetresUntil(1, '1000')
    const billed = session.vehicle().liningBill
    session.submit(end, { type: 'debug.setHull', payload: { hull: '0' } })
    const towed = session.advanceTo(end + 600)
    expect(typesOf(towed)).toContain('RescueTriggered')
    expect(settledOf(towed)).toEqual([])
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(billed))
    mineOneOreTile(session, end + 700, 0)
    const sale = sellAllAtTheSellBay(session, end + 800)
    expect(fromCanonical(settledOf(sale)[0].billed)).not.toEqual(ZERO_MONEY)
  })

  it('travels in the session snapshot, with what the visit has paid so far', () => {
    const { session, tick } = docked('50')
    session.submit(tick, sellTier(1))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    const vehicle = 'state' in restored ? restored.state.players.p1.vehicle : null
    expect(vehicle && toCanonical(vehicle.liningBill)).toBe(toCanonical(fromCanonical('30')))
    expect(vehicle?.liningPaidThisVisit && toCanonical(vehicle.liningPaidThisVisit)).toBe(
      toCanonical(fromCanonical('20')),
    )
  })
})

describe('lining bill per Sell bay visit (#128)', () => {
  it('pays the same lining selling cheap ore first, then the rest, as selling everything at once', () => {
    const split = docked('50')
    const splitEvents = [
      ...split.session.submit(split.tick, sellTier(1)),
      ...split.session.submit(split.tick, sellTier(RICH_TIER)),
      ...split.session.submit(split.tick, UNDOCK),
    ]
    const whole = docked('50')
    const wholeEvents = [
      ...whole.session.submit(whole.tick, SELL_ALL),
      ...whole.session.submit(whole.tick, UNDOCK),
    ]
    expect(toCanonical(totalOf(splitEvents, 'paid'))).toBe(toCanonical(fromCanonical('50')))
    expect(toCanonical(totalOf(splitEvents, 'paid'))).toBe(
      toCanonical(totalOf(wholeEvents, 'paid')),
    )
    expect(toCanonical(totalOf(splitEvents, 'forgiven'))).toBe(toCanonical(ZERO_MONEY))
    expect(toCanonical(walletOf(split.session))).toBe(toCanonical(walletOf(whole.session)))
  })

  it('carries the unpaid part to the next sale of the visit and forgives nothing before leaving', () => {
    const { session, tick } = docked('100')
    const cheap = settledOf(session.submit(tick, sellTier(1)))
    const rich = settledOf(session.submit(tick, sellTier(RICH_TIER)))
    expect(cheap).toEqual([settlement('1e+2', '2e+1', '0')])
    expect(rich).toEqual([settlement('8e+1', '6.75e+1', '0')])
    expect(toCanonical(session.vehicle().liningBill)).toBe('1.25e+1')
  })

  it('forgives what the visit could not pay only when the vehicle leaves the bay, never as debt', () => {
    const { session, tick } = docked('100')
    session.submit(tick, SELL_ALL)
    const walletBeforeLeaving = walletOf(session)
    const leaving = session.submit(tick + 1, UNDOCK)
    expect(typesOf(leaving).slice(0, 2)).toEqual(['LiningSettled', 'DockLeft'])
    expect(settledOf(leaving)).toEqual([settlement('1.25e+1', '0', '1.25e+1')])
    expect(walletOf(session)).toEqual(walletBeforeLeaving)
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(ZERO_MONEY))
    expect(session.vehicle().liningPaidThisVisit).toBeNull()
  })

  it('carries the whole bill past a visit with no payout', () => {
    const { session, tick } = docked('100')
    const leaving = session.submit(tick, UNDOCK)
    expect(settledOf(leaving)).toEqual([])
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(fromCanonical('100')))
  })

  it('settles the bill out of collected Refinery batches, capped at their value', () => {
    const { session, tick } = refinedBatchReadyAtTheSellBay()
    const carrying = carryingBill(session, '1e6')
    const before = walletOf(carrying)
    const collected = carrying.submit(tick, { type: 'collectRefined', payload: {} })
    const batch = collected.find((event) => event.type === 'RefineCollected')
    const value = batch?.type === 'RefineCollected' ? batch.value : null
    expect(settledOf(collected)).toEqual([settlement('1e6', value ?? '', '0')])
    expect(walletOf(carrying)).toEqual(before)
  })
})
