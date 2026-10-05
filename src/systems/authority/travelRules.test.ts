import { describe, expect, it } from 'vitest'
import { travelFee } from '../economy/planetCharges'
import { GENERATOR_VERSION } from '../generatorVersion'
import { fromCanonical, sub, toCanonical } from '../money'
import { bayPoseAt, dockedPoseAt } from '../vehicle/vehiclePose'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, GROUND, poseAbove, typesOf, WORLD_SEED } from './scriptedSession'
import { stateDigest } from './stateDigest'
import { canTravel } from './travelRules'

const SITE_1 = dockSiteOf(planetParamsFor(WORLD_SEED, 1))
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const travelTo = (toPlanet: number) => ({ type: 'travel', payload: { toPlanet } }) as const
const setCore = (count: number) => ({ type: 'debug.setCoreFragments', payload: { count } }) as const
const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** A docked vehicle on planet 1 with `fragments` in the bay and `money` in the wallet. */
function dockedWith(fragments: number, money = '1000') {
  const session = createScriptedSession()
  session.submit(0, setMoney(money))
  session.submit(0, setCore(fragments))
  session.submit(5, dock)
  return session
}

describe('travel', () => {
  it('leaves 7 of 70 fragments, takes exactly the fee and lands on planet 2', () => {
    const session = dockedWith(70)
    const events = session.submit(10, travelTo(2))
    expect(session.state().platform.coreBay).toBe(7)
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(fromCanonical('1000'), travelFee(1))),
    )
    expect(toCanonical(travelFee(1))).toBe('6.075e+1')
    expect(session.state().planet).toEqual({ index: 2, seed: WORLD_SEED })
    expect(events[0]).toMatchObject({
      type: 'TravelStarted',
      fromPlanet: 1,
      toPlanet: 2,
      cost: '6.075e+1',
      coreSpent: 63,
    })
  })

  it('logs travel_started, planet_unlocked, planet_entered and a travel digest, in order', () => {
    const session = dockedWith(63)
    const events = session.submit(10, travelTo(2))
    expect(typesOf(events)).toEqual([
      'TravelStarted',
      'MoneyChanged',
      'PlanetUnlocked',
      'PlanetEntered',
      'StateDigested',
    ])
    const planet2 = planetParamsFor(WORLD_SEED, 2)
    expect(events[2]).toMatchObject({ planetIndex: 2 })
    expect(events[3]).toMatchObject({
      planetSeed: planet2.planetSeed,
      generatorVersion: GENERATOR_VERSION,
      radius: 400,
    })
    expect(events[4]).toMatchObject({ scope: 'travel', digest: stateDigest(session.state()) })
  })

  it('travels from the Upgrade bay as from the Sell bay (#37), landing in the Sell bay', () => {
    const session = createScriptedSession()
    session.submit(0, setMoney('1000'))
    session.submit(0, setCore(63))
    session.submit(5, {
      ...poseAbove(GROUND, 1),
      payload: { ...poseAbove(GROUND, 1).payload, ...bayPoseAt(SITE_1, 'upgrade') },
    })
    session.submit(5, { type: 'dock', payload: { bay: 'upgrade' } })
    expect(canTravel(session.state(), 'p1')).toBe(true)
    expect(typesOf(session.submit(10, travelTo(2)))).toContain('TravelStarted')
    const site = dockSiteOf(planetParamsFor(WORLD_SEED, 2))
    expect(session.vehicle()).toMatchObject({ mode: 'docked', pose: dockedPoseAt(site) })
  })

  it('places the docked vehicle on planet 2 dock site with a fresh world and core', () => {
    const session = dockedWith(63)
    session.submit(10, travelTo(2))
    const site = dockSiteOf(planetParamsFor(WORLD_SEED, 2))
    expect(session.vehicle()).toMatchObject({ mode: 'docked', pose: dockedPoseAt(site) })
    expect(session.state().world).toEqual({ chunks: {} })
    expect(session.state().core).toEqual({
      reachedTick: null,
      harvestedTiles: 0,
      isCompleted: false,
    })
  })

  it('keeps the core drive look on planet 2, since it stays for the run', () => {
    const session = dockedWith(63)
    session.submit(10, travelTo(2))
    expect(session.state().platform.visualState).toBe('core_drive')
  })

  it('refuses with core_short at 62 fragments and changes nothing', () => {
    const session = dockedWith(62)
    const before = session.state()
    expect(rejectionOf(session.submit(10, travelTo(2)))).toBe('core_short')
    expect(session.state()).toBe(before)
    expect(canTravel(before, 'p1')).toBe(false)
  })

  it('refuses with money_short below the fee and changes nothing', () => {
    const session = dockedWith(70, '60.749')
    const before = session.state()
    expect(rejectionOf(session.submit(10, travelTo(2)))).toBe('money_short')
    expect(session.state()).toBe(before)
  })

  it('refuses with not_docked away from the dock', () => {
    const session = createScriptedSession()
    session.submit(0, setMoney('1000'))
    session.submit(0, setCore(70))
    session.submit(5, poseAbove(GROUND, 2))
    expect(rejectionOf(session.submit(10, travelTo(2)))).toBe('not_docked')
    expect(session.state().planet.index).toBe(1)
  })

  it('refuses any planet but the next one with not_next_planet', () => {
    const session = dockedWith(70)
    expect(rejectionOf(session.submit(10, travelTo(3)))).toBe('not_next_planet')
    expect(rejectionOf(session.submit(11, travelTo(1)))).toBe('not_next_planet')
    expect(canTravel(session.state(), 'p1')).toBe(true)
  })

  it('needs 127 fragments to leave planet 2', () => {
    const session = dockedWith(63, '1e6')
    session.submit(10, travelTo(2))
    session.submit(11, setCore(126))
    expect(rejectionOf(session.submit(12, travelTo(3)))).toBe('core_short')
    session.submit(13, setCore(127))
    expect(typesOf(session.submit(14, travelTo(3)))[0]).toBe('TravelStarted')
  })

  it('gives the same planet-2 dock site and digest for the same seed and commands', () => {
    const first = dockedWith(70)
    const second = dockedWith(70)
    first.submit(10, travelTo(2))
    second.submit(10, travelTo(2))
    expect(second.vehicle().pose).toEqual(first.vehicle().pose)
    expect(stateDigest(second.state())).toBe(stateDigest(first.state()))
  })
})

describe('core fragments debug command', () => {
  it('sets the bay and completes the core at 63, once, like a dock would', () => {
    const session = createScriptedSession()
    expect(typesOf(session.submit(1, setCore(62)))).toEqual(['DebugCommandApplied'])
    expect(typesOf(session.submit(2, setCore(63)))).toEqual([
      'PlatformConfigurationChanged',
      'CoreCompleted',
      'DebugCommandApplied',
    ])
    expect(typesOf(session.submit(3, setCore(70)))).toEqual(['DebugCommandApplied'])
  })
})
