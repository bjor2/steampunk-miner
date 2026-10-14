import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'
import { shownPlanetCardOf } from './planetCardSlice'

const MAGNETIC_LINE = 'Magnetic. Ferrous veins throw fields; the probe reads them.'

let sink: MemorySink

const game = () => useGameStore.getState()
const shownTags = () => game().planetCard?.lines.map((line) => line.tag) ?? []

function travelFrom(planetTier: number): void {
  game().setPlanet(planetTier)
  game().setCoreFragments(game().platform.coreNeeded ?? 0)
  game().giveMoney('1e30')
  game().dock('sell')
  game().travel()
}

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  resetGameStore()
})

afterEach(() => uninstallRunLog())

describe('planet card', () => {
  it('opens on arrival at a magnetic planet with its tag and arrival line, behind the travel card', () => {
    travelFrom(24)
    expect(game().planetTier).toBe(25)
    expect(game().travelTransition).toEqual({ fromPlanet: 24, toPlanet: 25 })
    expect(game().planetCard?.lines).toMatchObject([
      { tag: 'Magnetic', arrivalLine: MAGNETIC_LINE },
    ])
    expect(shownPlanetCardOf(game())).toBeNull()
    game().finishTravelTransition()
    expect(shownPlanetCardOf(game())).toBe(game().planetCard)
  })

  it('opens when the debug API or a scenario moves the session to a magnetic planet, and not on P30', () => {
    game().setPlanet(28)
    expect(shownTags()).toEqual(['Magnetic'])
    game().setPlanet(30)
    expect(game().planetCard).toBeNull()
  })

  it('shows no card on planet 1, where a run starts', () => {
    game().openPlanetCard()
    expect(game().planetCard).toBeNull()
  })

  it('closes when the vehicle undocks, and on dismiss', () => {
    travelFrom(24)
    game().undock()
    expect(game().planetCard).toBeNull()
    game().setPlanet(25)
    game().dismissPlanetCard()
    expect(game().planetCard).toBeNull()
  })

  it('changes no authority state and logs no line of its own', () => {
    game().setPlanet(25)
    const before = { digest: takeSessionSnapshot().digest, lines: sink.events.length }
    game().dismissPlanetCard()
    game().openPlanetCard()
    expect(shownTags()).toEqual(['Magnetic'])
    expect({ digest: takeSessionSnapshot().digest, lines: sink.events.length }).toEqual(before)
  })
})
