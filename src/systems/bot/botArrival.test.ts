import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import { stateDigest } from '../authority/stateDigest'
import type { CommandIntent } from '../authority/authorityCommand'
import { createBotSession } from './botSession'
import { playBotToPlanetFrom, type BotArrival } from './botArrival'

// The bot that takes a fresh save to a later planet for the per-planet browser specs (ticket 656):
// it lands by bought travel with play commands only, and its script replays to the same state.

/** The browser's fresh save: planet 1 on world seed 1 (`STARTING_PLANET` in gameStore.ts). */
const FRESH_SAVE = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })

let toPlanet2: BotArrival | null = null

function arrivalOnPlanet2(): BotArrival {
  toPlanet2 ??= playBotToPlanetFrom(FRESH_SAVE, 'p1', 2)
  return toPlanet2
}

/** The script submitted at its ticks on a session of its own, as the live `fastForward` does. */
function replayedState(start: AuthorityState, arrival: BotArrival): AuthorityState {
  const session = createBotSession(start, 'p1')
  for (const { tick, ...intent } of arrival.script) {
    session.wait(tick - session.tick())
    session.submit(intent as CommandIntent)
  }
  session.wait(arrival.endTick - session.tick())
  return session.state()
}

describe('bot arrival', () => {
  it('lands a fresh save on planet 2 by travel after harvesting the core of planet 1', () => {
    const arrival = arrivalOnPlanet2()
    expect(arrival.isArrived).toBe(true)
    expect(arrival.planetIndex).toBe(2)
    expect(arrival.script.at(-1)).toMatchObject({ type: 'travel', payload: { toPlanet: 2 } })
  })

  it('sends no debug command on the way', () => {
    const types = arrivalOnPlanet2().script.map((command) => command.type)
    expect(types.filter((type) => type.startsWith('debug.'))).toEqual([])
  })

  it('replays its script to the state it stopped with', () => {
    const arrival = arrivalOnPlanet2()
    const replayed = replayedState(FRESH_SAVE, arrival)
    expect(replayed.debugApplied).toBe(false)
    expect(stateDigest(replayed)).toBe(arrival.digest)
  })

  it('answers the planet it is on already as arrived, with nothing to play', () => {
    const arrival = playBotToPlanetFrom(FRESH_SAVE, 'p1', 1)
    expect(arrival).toMatchObject({ isArrived: true, planetIndex: 1, script: [], endTick: 0 })
  })
})
