import { describe, expect, it } from 'vitest'
import { startScenarioCommands } from '../startScenarioCommands'
import type { DomainEvent } from './domainEvent'
import { isFeatureUnlocked } from './featureUnlocks'
import { createScriptedSession, WORLD_SEED } from './scriptedSession'

const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const travelTo = (toPlanet: number) => ({ type: 'travel', payload: { toPlanet } }) as const

/** A seeded run docked on `planetTier` with the money and fragments to travel on. */
function dockedOnPlanet(planetTier: number) {
  const session = createScriptedSession()
  const scenario = { planetTier, planetSeed: WORLD_SEED, money: '1e30', coreFragments: 100000 }
  for (const command of startScenarioCommands(scenario)) session.submit(0, command)
  session.submit(5, dock)
  return session
}

const unlockedIdsOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'FeatureUnlocked' ? [event.featureId] : []))

describe('feature unlocks on travel', () => {
  it('unlocks planet_2 on arriving at planet 2, logged between planet_unlocked and planet_entered', () => {
    const session = dockedOnPlanet(1)
    expect(isFeatureUnlocked(session.state(), 'planet_2')).toBe(false)
    const events = session.submit(10, travelTo(2))
    expect(unlockedIdsOf(events)).toEqual(['planet_2'])
    const types = events.map((event) => event.type)
    expect(types.indexOf('FeatureUnlocked')).toBe(types.indexOf('PlanetUnlocked') + 1)
    expect(isFeatureUnlocked(session.state(), 'planet_2')).toBe(true)
  })

  it('holds the planet 1 gates open from the start without logging them again', () => {
    const session = dockedOnPlanet(1)
    expect(isFeatureUnlocked(session.state(), 'core_harvest')).toBe(true)
    expect(unlockedIdsOf(session.submit(10, travelTo(2)))).not.toContain('core_harvest')
  })

  it('unlocks tunnel_wrecker on arriving at planet 6, its built module (#94)', () => {
    const session = dockedOnPlanet(5)
    expect(isFeatureUnlocked(session.state(), 'tunnel_wrecker')).toBe(false)
    expect(unlockedIdsOf(session.submit(10, travelTo(6)))).toEqual(['tunnel_wrecker'])
    expect(isFeatureUnlocked(session.state(), 'tunnel_wrecker')).toBe(true)
  })

  it('unlocks blasting_charges on arriving at planet 7, its built module (#95)', () => {
    const session = dockedOnPlanet(6)
    expect(isFeatureUnlocked(session.state(), 'blasting_charges')).toBe(false)
    expect(unlockedIdsOf(session.submit(10, travelTo(7)))).toEqual(['blasting_charges'])
    expect(isFeatureUnlocked(session.state(), 'blasting_charges')).toBe(true)
  })

  it('unlocks no vision row on arriving at its planet (#90)', () => {
    const session = dockedOnPlanet(7)
    expect(unlockedIdsOf(session.submit(10, travelTo(8)))).toEqual([])
    expect(isFeatureUnlocked(session.state(), 'heat_lava')).toBe(false)
  })

  it('unlocks auto_guns on arriving at planet 4, its module being built (#93)', () => {
    const session = dockedOnPlanet(3)
    expect(isFeatureUnlocked(session.state(), 'auto_guns')).toBe(false)
    expect(unlockedIdsOf(session.submit(10, travelTo(4)))).toEqual(['auto_guns'])
    expect(isFeatureUnlocked(session.state(), 'auto_guns')).toBe(true)
  })

  it('unlocks refinery_bay on arriving at planet 3, where the platform gets its Refinery bay', () => {
    const session = dockedOnPlanet(2)
    expect(isFeatureUnlocked(session.state(), 'refinery_bay')).toBe(false)
    expect(unlockedIdsOf(session.submit(10, travelTo(3)))).toEqual(['refinery_bay'])
    expect(isFeatureUnlocked(session.state(), 'refinery_bay')).toBe(true)
  })

  it('keeps refinery_bay open on every later planet without logging it again', () => {
    const session = dockedOnPlanet(3)
    expect(isFeatureUnlocked(session.state(), 'refinery_bay')).toBe(true)
    expect(unlockedIdsOf(session.submit(10, travelTo(4)))).not.toContain('refinery_bay')
  })

  it('does not unlock endless on arriving at planet 40 or travelling past it', () => {
    const session = dockedOnPlanet(39)
    const toFinale = session.submit(10, travelTo(40))
    session.submit(15, dock)
    const pastFinale = session.submit(20, travelTo(41))
    expect(session.state().planet.index).toBe(41)
    expect(unlockedIdsOf([...toFinale, ...pastFinale])).not.toContain('endless_unlock')
    expect(isFeatureUnlocked(session.state(), 'endless_unlock')).toBe(false)
  })

  it('answers false for an id that is not on the schedule', () => {
    expect(isFeatureUnlocked(dockedOnPlanet(2).state(), 'warp_drive')).toBe(false)
  })
})
