import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { deriveSummary } from '../logging/runSummary'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { fromCanonical } from '../systems/money'
import { parseScenario, type Scenario } from '../systems/scenario'
import { createDebugApi, DebugCommandNotImplementedError } from './debugApi'

const readScenarioFile = (name: string) =>
  readFileSync(new URL(`../../scenarios/${name}`, import.meta.url), 'utf8')

let sink: MemorySink

/** A fresh run: new authority, new log. */
function startRun(): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
}

beforeEach(startRun)
afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('debug api: set state', () => {
  it('drives the game through the design doc command names', () => {
    const debug = createDebugApi()
    expect(debug.setPlanet(300)).toEqual({ ok: true })
    debug.setPlanetSeed(83921)
    debug.giveMoney('1e100')
    debug.teleportToDepthTiles(40)
    expect(game()).toMatchObject({
      planetTier: 300,
      planetSeed: 83921,
      depthTiles: 40,
      money: fromCanonical('1e100'),
    })
  })

  it('answers a bad argument with its problems and changes nothing', () => {
    const debug = createDebugApi()
    expect(debug.giveMoney(5 as unknown as string)).toMatchObject({ ok: false })
    expect(debug.setPlanet(-1)).toEqual({
      ok: false,
      problems: ['planetTier must be a whole number >= 0, got -1'],
    })
    expect(sink.commands).toEqual([])
  })

  it('says plainly that a command is not built yet', () => {
    expect(() => createDebugApi().teleportToCore()).toThrow(DebugCommandNotImplementedError)
    expect(() => createDebugApi().teleportToDepth(5000)).toThrow(DebugCommandNotImplementedError)
  })
})

describe('debug api: time', () => {
  it('fast-forwards the authority and reports where it stands', () => {
    const result = createDebugApi().fastForward(7200)
    expect(result).toMatchObject({ ok: true, tick: 7200 })
  })

  it('submits scripted commands at their ticks during a fast-forward', () => {
    createDebugApi().fastForward(600, [
      { tick: 300, type: 'debug.grantMoney', payload: { amount: '5' } },
    ])
    expect(sink.commands).toMatchObject([{ tick: 300, type: 'debug.grantMoney' }])
    expect(game().money).toEqual(fromCanonical('5'))
  })

  it('refuses a scripted command outside the window', () => {
    const result = createDebugApi().fastForward(60, [
      { tick: 61, type: 'debug.grantMoney', payload: { amount: '5' } },
    ])
    expect(result).toEqual({
      ok: false,
      problems: ['commands[0].tick must be from 0 to 60, got 61'],
    })
  })
})

describe('debug api: snapshot and restore', () => {
  it('restores a snapshot to the same digest, and play continues from it', () => {
    const debug = createDebugApi()
    debug.giveMoney('1e30')
    const taken = debug.snapshot()
    if (!taken.ok) throw new Error('snapshot refused')
    debug.giveMoney('1')
    expect(debug.restore(JSON.parse(JSON.stringify(taken.snapshot)))).toEqual({
      ok: true,
      tick: taken.snapshot.tick,
      digest: taken.snapshot.digest,
    })
    expect(game().money).toEqual(fromCanonical('1e30'))
    expect(debug.giveMoney('2')).toEqual({ ok: true })
    expect(game().money).toEqual(fromCanonical('1.000000000000000000000000000002e30'))
  })

  it('refuses a snapshot from another generator version', () => {
    const debug = createDebugApi()
    const taken = debug.snapshot()
    if (!taken.ok) throw new Error('snapshot refused')
    expect(debug.restore({ ...taken.snapshot, generatorVersion: 99 })).toEqual({
      ok: false,
      problems: ['snapshot.generatorVersion is 99, this build reads 1'],
    })
  })
})

describe('debug api: scenarios', () => {
  const planet1Text = readScenarioFile('planet1-start.scenario.json')

  function playPlanet1Scenario() {
    startRun()
    const result = createDebugApi().applyScenario(JSON.parse(planet1Text))
    return { result, events: [...sink.events] }
  }

  it('logs the exact sequence of core events of the committed planet 1 scenario', () => {
    const { events } = playPlanet1Scenario()
    expect(events.map(({ event, tick, cmd, data }) => ({ event, tick, cmd, data }))).toEqual([
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: [0, 1],
        data: { command: 'debug.setPlanet', args: { planetIndex: 1 } },
      },
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: [0, 2],
        data: { command: 'debug.setPlanetSeed', args: { planetSeed: 83921 } },
      },
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: [0, 3],
        data: { command: 'debug.setMoney', args: { amount: '0e+0' } },
      },
      {
        event: 'debug_command_applied',
        tick: 0,
        cmd: undefined,
        data: { command: 'fastForward', args: { ticks: 7200, commands: 0 } },
      },
      {
        event: 'state_digest',
        tick: 3600,
        cmd: undefined,
        data: { digest: expect.stringMatching(/^[0-9a-f]{16}$/), scope: 'periodic' },
      },
      {
        event: 'state_digest',
        tick: 7200,
        cmd: undefined,
        data: { digest: expect.stringMatching(/^[0-9a-f]{16}$/), scope: 'periodic' },
      },
    ])
  })

  it('emits only events that validate against the schema registry', () => {
    expect(playPlanet1Scenario().events.flatMap(runEventProblems)).toEqual([])
  })

  it('summarises two runs of the same scenario identically', () => {
    const first = deriveSummary(playPlanet1Scenario().events)
    const second = deriveSummary(playPlanet1Scenario().events)
    expect(second).toEqual(first)
    expect(first).toMatchObject({ durationTicks: 7200, debugCommandsApplied: 4 })
  })

  it('reaches the same digest through the debug API as through ?scenario=', () => {
    const viaDebugApi = playPlanet1Scenario().result
    startRun()
    // The ?scenario= path of bootstrap.ts: parse the text, then apply through the store.
    const { scenario, problems } = parseScenario(planet1Text)
    expect(problems).toEqual([])
    game().applyScenario(scenario as Scenario)
    const viaLaunch = createDebugApi().snapshot()
    expect(viaLaunch.ok && viaDebugApi.ok).toBe(true)
    expect(viaDebugApi).toMatchObject({ digest: viaLaunch.ok ? viaLaunch.snapshot.digest : '' })
  })

  it('refuses the broken scenario with every problem and applies none of it', () => {
    const before = createDebugApi().snapshot()
    const result = createDebugApi().applyScenario(
      JSON.parse(readScenarioFile('broken.scenario.json')),
    )
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? [] : result.problems).toHaveLength(6)
    expect(createDebugApi().snapshot()).toEqual(before)
    expect(sink.events).toEqual([])
    expect(sink.commands).toEqual([])
  })
})
