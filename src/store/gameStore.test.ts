import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, useGameStore } from './gameStore'

let sink: ReturnType<typeof createMemorySink>

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('game store: scenario commands', () => {
  it('puts the player on the requested planet at its surface', () => {
    game().teleportToDepth(0.5)
    game().setPlanet(317)
    expect(game().planetTier).toBe(317)
    expect(game().depth).toBe(0)
  })

  it('sets the planet seed', () => {
    game().setPlanetSeed(83921)
    expect(game().planetSeed).toBe(83921)
  })

  it('adds granted money to what the player has, up to 1e100', () => {
    game().giveMoney(50)
    game().giveMoney(1e100)
    expect(game().money).toBe(50 + 1e100)
  })

  it('applies a whole scenario at once', () => {
    game().applyStartScenario({ planetTier: 317, planetSeed: 83921, depth: 0.82 })
    expect(game()).toMatchObject({ planetTier: 317, planetSeed: 83921, depth: 0.82 })
  })

  it('refuses an illegal scenario without applying any of it', () => {
    expect(() => game().applyStartScenario({ planetTier: 5, depth: 3 })).toThrow(/depth/)
    expect(game().planetTier).toBe(0)
  })

  it('refuses a negative money grant', () => {
    expect(() => game().giveMoney(-1)).toThrow(/money/)
    expect(game().money).toBe(0)
  })
})

describe('game store: run log', () => {
  it('records a debug command so analytics can tell granted money from earned money', () => {
    game().setPlanet(3)
    game().giveMoney(100)
    expect(sink.events.map((event) => event.event)).toEqual([
      'debug_command_applied',
      'debug_command_applied',
    ])
    expect(sink.events[1].data).toEqual({ command: 'giveMoney', args: { amount: 100 } })
  })

  it('stamps the event with the place the player is in after the command', () => {
    game().setPlanet(9)
    expect(sink.events[0]).toMatchObject({ planet: 9, depth: 0, playerId: 'player_1' })
  })

  it('records nothing for a refused command', () => {
    expect(() => game().giveMoney(-1)).toThrow()
    expect(sink.events).toEqual([])
  })
})
