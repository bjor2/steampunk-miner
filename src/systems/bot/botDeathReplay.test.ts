import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { breakDeathReplay, deepestOpenBand } from './botDeathReplay'
import type { BotPlanet } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf } from './botTravel'
import type { TripGoal } from './tripGoal'

const WORLD_SEED = 83921
const CORE: TripGoal = { kind: 'core' }
const BAND_4: TripGoal = { kind: 'ore', band: 4 }
const DIED: readonly DomainEvent[] = [
  { tick: 0, type: 'VehicleDestroyed', cause: 'enemy', attacker: null },
]

function botOn(planetIndex: number): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  return { session, planet: botPlanetOf(session, 'never') }
}

function dieOn(session: BotSession, planet: BotPlanet, goal: TripGoal, times: number): void {
  for (let death = 0; death < times; death++) breakDeathReplay(session, planet, goal, DIED)
}

function openBandOf(session: BotSession, planet: BotPlanet): number | null {
  return deepestOpenBand(planet, session.vehicle().levels)
}

/** One engine step more: the vehicle is no longer the one that died. */
function buyEngineStep(session: BotSession): void {
  session.submit(setUpgradeCommand('engine', session.vehicle().levels.engine + 1))
}

describe('bot: the death-replay breaker (#198)', () => {
  it('retreats above the core on planet 9 after the second death on a core trip', () => {
    const { session, planet } = botOn(9)
    dieOn(session, planet, CORE, 1)
    expect(openBandOf(session, planet)).toBeNull()
    dieOn(session, planet, CORE, 1)
    expect(openBandOf(session, planet)).toBe(5)
  })

  it('closes every deeper route with a band, so ore trips stay above the band that killed twice', () => {
    const { session, planet } = botOn(9)
    dieOn(session, planet, BAND_4, 2)
    expect(openBandOf(session, planet)).toBe(3)
  })

  it('keeps the shallower closure when a route above a closed one kills twice too', () => {
    const { session, planet } = botOn(9)
    dieOn(session, planet, CORE, 2)
    dieOn(session, planet, BAND_4, 2)
    expect(openBandOf(session, planet)).toBe(3)
  })

  it('counts deaths per route, so one death on each of two routes closes neither', () => {
    const { session, planet } = botOn(9)
    dieOn(session, planet, CORE, 1)
    dieOn(session, planet, BAND_4, 1)
    expect(openBandOf(session, planet)).toBeNull()
  })

  it('reopens the routes once the vehicle has a level it did not die with', () => {
    const { session, planet } = botOn(9)
    dieOn(session, planet, CORE, 2)
    buyEngineStep(session)
    expect(openBandOf(session, planet)).toBeNull()
  })

  it('takes two new deaths to close a reopened route again', () => {
    const { session, planet } = botOn(9)
    dieOn(session, planet, CORE, 2)
    buyEngineStep(session)
    dieOn(session, planet, CORE, 1)
    expect(openBandOf(session, planet)).toBeNull()
    dieOn(session, planet, CORE, 1)
    expect(openBandOf(session, planet)).toBe(5)
  })

  it('ignores a trip that ended without a death', () => {
    const { session, planet } = botOn(9)
    for (let trip = 0; trip < 3; trip++) breakDeathReplay(session, planet, CORE, [])
    expect(openBandOf(session, planet)).toBeNull()
  })

  it('leaves every route open on planet 7 whatever kills it, as before', () => {
    const { session, planet } = botOn(7)
    dieOn(session, planet, CORE, 5)
    expect(openBandOf(session, planet)).toBeNull()
  })
})
