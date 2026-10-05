import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { createAuthorityState } from '../systems/authority/authorityState'
import { snapshotOf, type Authority } from '../systems/authority/loopbackAuthority'
import { fromCanonical, toCanonical, ZERO_MONEY } from '../systems/money'
import {
  createStartingAuthority,
  resetGameStore,
  STARTING_VALUES,
  takeSessionSnapshot,
  useGameStore,
} from './gameStore'

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
    game().teleportToDepthTiles(50)
    game().setPlanet(317)
    expect(game().planetTier).toBe(317)
    expect(game().depthTiles).toBe(0)
  })

  it('sets the planet seed', () => {
    game().setPlanetSeed(83921)
    expect(game().planetSeed).toBe(83921)
  })

  it('adds granted money to what the player has, up to 1e100 and past 1e308', () => {
    game().giveMoney('50')
    game().giveMoney('1e100')
    // 50 sits 98 digits below 1e100, beyond the 40 significant digits money keeps (#5).
    expect(toCanonical(game().money)).toBe('1e+100')
    game().giveMoney('1e400')
    expect(toCanonical(game().money)).toBe('1e+400')
  })

  it('keeps every digit of a grant within 40 significant digits', () => {
    game().giveMoney('1e30')
    game().giveMoney('1')
    expect(toCanonical(game().money)).toBe('1.000000000000000000000000000001e+30')
  })

  it('applies a whole scenario at once', () => {
    game().applyStartScenario({ planetTier: 317, planetSeed: 83921, depthTiles: 82, money: '1e30' })
    expect(game()).toMatchObject({
      planetTier: 317,
      planetSeed: 83921,
      depthTiles: 82,
      money: fromCanonical('1e30'),
    })
  })

  it('sets money from a scenario rather than adding to it', () => {
    game().giveMoney('5')
    game().applyStartScenario({ money: '2' })
    expect(game().money).toEqual(fromCanonical('2'))
  })

  it('refuses an illegal scenario without applying any of it', () => {
    expect(() => game().applyStartScenario({ planetTier: 5, depthTiles: -3 })).toThrow(/depth/)
    expect(game().planetTier).toBe(STARTING_VALUES.planetTier)
  })

  it('refuses a negative money grant', () => {
    expect(() => game().giveMoney('-1')).toThrow(/money/)
    expect(game().money).toEqual(ZERO_MONEY)
  })
})

describe('game store: authority', () => {
  /** Records what the store submits and never answers, as a stalled remote host would. */
  function connectSilentAuthority(): AuthorityCommand[] {
    const submitted: AuthorityCommand[] = []
    const startSnapshot = createStartingAuthority().snapshot()
    const silent: Authority = {
      submit: (command) => void submitted.push(command),
      advanceTo: () => {},
      subscribe: () => () => {},
      snapshot: () => startSnapshot,
    }
    resetGameStore(silent)
    return submitted
  }

  it('changes no planet or money until the authority answers', () => {
    const submitted = connectSilentAuthority()
    game().setPlanet(3)
    game().setPlanetSeed(99)
    game().giveMoney('100')
    game().applyStartScenario({ planetTier: 4, planetSeed: 5, money: '6' })
    expect(game()).toMatchObject({
      planetTier: STARTING_VALUES.planetTier,
      planetSeed: STARTING_VALUES.planetSeed,
      money: ZERO_MONEY,
    })
    expect(submitted.map((command) => command.type)).toEqual([
      'debug.setPlanet',
      'debug.setPlanetSeed',
      'debug.grantMoney',
      'debug.setPlanet',
      'debug.setPlanetSeed',
      'debug.setMoney',
    ])
  })

  it('stamps each command with the player, the authority tick and a rising seq', () => {
    const submitted = connectSilentAuthority()
    game().setPlanet(3)
    game().giveMoney('1.50')
    expect(submitted).toEqual([
      {
        playerId: 'player_1',
        tick: 0,
        seq: 1,
        type: 'debug.setPlanet',
        payload: { planetIndex: 3 },
      },
      {
        playerId: 'player_1',
        tick: 0,
        seq: 2,
        type: 'debug.grantMoney',
        payload: { amount: '1.5e+0' },
      },
    ])
  })

  it('shows what the authority says, even a state the store never asked for', () => {
    const state = createAuthorityState({ planetIndex: 7, planetSeed: 8, playerIds: ['player_1'] })
    const answered = { ...state, tick: 5 }
    let tell: (events: []) => void = () => {}
    const authority: Authority = {
      submit: () => tell([]),
      advanceTo: () => {},
      subscribe: (onEvents) => {
        tell = onEvents
        return () => {}
      },
      snapshot: () => snapshotOf(answered),
    }
    resetGameStore(authority)
    game().setPlanetSeed(1)
    expect(game()).toMatchObject({ planetTier: 7, planetSeed: 8 })
  })

  it('shows that a debug command was applied, as the authority says', () => {
    expect(game().debugApplied).toBe(false)
    game().setPlanetSeed(5)
    expect(game().debugApplied).toBe(true)
  })

  it('starts each reset on the starting values', () => {
    game().giveMoney('5')
    resetGameStore()
    expect(game()).toMatchObject({ ...STARTING_VALUES })
  })
})

describe('game store: run log', () => {
  it('records a debug command so analytics can tell granted money from earned money', () => {
    game().setPlanet(3)
    game().giveMoney('100')
    expect(sink.events.map((event) => event.event)).toEqual([
      'debug_command_applied',
      'debug_command_applied',
    ])
    expect(sink.events[1].data).toEqual({
      command: 'debug.grantMoney',
      args: { amount: '1e+2' },
    })
  })

  it('records each command a scenario applies', () => {
    game().applyStartScenario({ planetTier: 2, money: '7' })
    expect(sink.events.map((event) => event.data)).toEqual([
      { command: 'debug.setPlanet', args: { planetIndex: 2 } },
      { command: 'debug.setMoney', args: { amount: '7e+0' } },
    ])
  })

  it('stamps the event with the place the player is in after the command', () => {
    game().teleportToDepthTiles(50)
    game().setPlanet(9)
    expect(sink.events[1]).toMatchObject({ planet: 9, depthTiles: 0, playerId: 'player_1' })
  })

  it('writes every submitted command to the replay file in submission order', () => {
    game().setPlanet(3)
    game().giveMoney('100')
    expect(sink.commands).toEqual([
      {
        playerId: 'player_1',
        tick: 0,
        seq: 1,
        type: 'debug.setPlanet',
        payload: { planetIndex: 3 },
      },
      {
        playerId: 'player_1',
        tick: 0,
        seq: 2,
        type: 'debug.grantMoney',
        payload: { amount: '1e+2' },
      },
    ])
  })

  it('records nothing for a refused command', () => {
    expect(() => game().giveMoney('-1')).toThrow()
    expect(sink.events).toEqual([])
  })
})

describe('game store: vehicle', () => {
  it('copies the vehicle from the authority after a debug command', () => {
    game().setEnergy('37.5')
    game().setUpgrade('cargo_hold', 2)
    expect(game().vehicle).toMatchObject({ energy: 9000, cargoCapacity: 18, mode: 'active' })
  })

  it('refuses a debug value the authority would refuse, without sending it', () => {
    expect(() => game().setEnergy('500')).toThrow(/energy/)
    expect(() => game().setUpgrade('laser', 1)).toThrow(/laser/)
    expect(sink.commands).toEqual([])
  })

  it('sends pose reports and rescue calls as player commands, not debug ones', () => {
    game().requestRescue()
    game().reportPose({
      x: 500,
      y: 300500,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: 1,
      driving: false,
      thrusting: false,
      drilling: false,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
    })
    expect(sink.commands.map((command) => command.type)).toEqual(['requestRescue', 'reportPose'])
    expect(game().debugApplied).toBe(false)
  })

  it('moves the authority one tick per fixed step', () => {
    game().advanceOneTick()
    game().advanceOneTick()
    expect(takeSessionSnapshot().tick).toBe(2)
  })
})
