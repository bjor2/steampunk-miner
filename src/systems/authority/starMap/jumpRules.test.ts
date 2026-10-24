import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical } from '../../money'
import { fuelOf } from '../../vehicle/vehicleFuel'
import { dockedPoseAt } from '../../vehicle/vehiclePose'
import { dockSiteOf } from '../../world/dockSite'
import { freshPlanetParamsFor, oreRulesVersionOnEntry } from '../../world/planetParams'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, typesOf, WORLD_SEED } from '../scriptedSession'
import { stateDigest } from '../stateDigest'

const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const jumpTo = (planet: string, system = '1') =>
  ({ type: 'jumpToPlanet', payload: { system, planet } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** A vehicle docked on planet 1 with `units` fuel in the tank and no core fragment in the bay. */
function fuelledWith(units: number) {
  const session = createScriptedSession()
  session.submit(0, setMoney('1e6'))
  session.submit(5, dock)
  if (units > 0) session.submit(6, buyFuel(units))
  return session
}

describe('star map jump (ticket 755)', () => {
  it('jumps to the next planet for five units of fuel, with no core fragment and no fee', () => {
    const session = fuelledWith(5)
    const wallet = session.state().players.p1.wallet
    const events = session.submit(10, jumpTo('2'))
    expect(session.state().planet).toEqual({
      index: 2,
      seed: WORLD_SEED,
      oreRulesVersion: oreRulesVersionOnEntry(2),
    })
    expect('fuel' in session.vehicle()).toBe(false)
    expect(session.state().players.p1.wallet).toBe(wallet)
    expect(events[0]).toMatchObject({
      type: 'TravelStarted',
      fromPlanet: 1,
      toPlanet: 2,
      cost: '0e+0',
      coreSpent: 0,
      fuelSpent: '5e+0',
    })
  })

  it('logs travel_started, planet_unlocked, feature_unlocked, planet_entered, the cache and a travel digest, in order', () => {
    const session = fuelledWith(5)
    const events = session.submit(10, jumpTo('2'))
    expect(typesOf(events)).toEqual([
      'TravelStarted',
      'PlanetUnlocked',
      'FeatureUnlocked',
      'PlanetEntered',
      'ArtefactCacheSpawned',
      'StateDigested',
    ])
    expect(events[5]).toMatchObject({ scope: 'travel', digest: stateDigest(session.state()) })
  })

  it('skips ahead to any planet of the system, burning a quarter of U0 more per planet crossed', () => {
    const session = fuelledWith(9)
    const events = session.submit(10, jumpTo('4'))
    expect(session.state().planet.index).toBe(4)
    expect(toCanonical(fuelOf(session.vehicle()))).toBe(toCanonical(fromCanonical('2')))
    expect(events[0]).toMatchObject({ fromPlanet: 1, toPlanet: 4, fuelSpent: '7e+0' })
    const site = dockSiteOf(freshPlanetParamsFor(WORLD_SEED, 4))
    expect(session.vehicle()).toMatchObject({ mode: 'docked', pose: dockedPoseAt(site) })
  })

  it('jumps back to an earlier planet without unlocking it again', () => {
    const session = fuelledWith(10)
    session.submit(10, jumpTo('2'))
    const events = session.submit(20, jumpTo('1'))
    expect(session.state().planet.index).toBe(1)
    expect(typesOf(events)).not.toContain('PlanetUnlocked')
    expect(events[0]).toMatchObject({ fromPlanet: 2, toPlanet: 1, fuelSpent: '5e+0' })
  })

  it('refuses a jump the tank cannot burn with fuel_short, and changes nothing', () => {
    const session = fuelledWith(2)
    const before = session.state()
    const events = session.submit(10, jumpTo('4'))
    expect(rejectionOf(events)).toBe('fuel_short')
    expect(session.state()).toBe(before)
  })

  it('refuses a jump with an empty tank, however much money the wallet holds', () => {
    expect(rejectionOf(fuelledWith(0).submit(10, jumpTo('2')))).toBe('fuel_short')
  })

  it('refuses a jump away from the dock', () => {
    const session = createScriptedSession()
    expect(rejectionOf(session.submit(10, jumpTo('2')))).toBe('not_docked')
  })

  it('refuses a jump to the planet the session is on', () => {
    expect(rejectionOf(fuelledWith(1).submit(10, jumpTo('1')))).toBe('same_planet')
  })

  it('refuses a jump into another system without the jump drive (ticket 759)', () => {
    expect(rejectionOf(fuelledWith(1).submit(10, jumpTo('1', '2')))).toBe('no_jump_drive')
  })

  it('refuses a destination past the safe planet indexes', () => {
    const far = (2n ** 53n).toString()
    expect(rejectionOf(fuelledWith(1).submit(10, jumpTo(far)))).toBe('no_planet')
  })

  it('refuses an address that is not canonical index text', () => {
    expect(rejectionOf(fuelledWith(1).submit(10, jumpTo('02')))).toBe('invalid_payload')
    expect(rejectionOf(fuelledWith(1).submit(10, jumpTo('0')))).toBe('invalid_payload')
  })

  it('gives the same planet, dock site and digest for the same seed and commands', () => {
    const jumped = () => {
      const session = fuelledWith(6)
      session.submit(10, jumpTo('3'))
      return stateDigest(session.state())
    }
    expect(jumped()).toBe(jumped())
  })
})
