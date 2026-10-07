import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { parseScenario, type Scenario } from '../systems/scenario'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'
import { pressAction, resetInput, routeKeyChange } from './inputRuntime'
import { isLiveStepHeld } from './liveStepSlice'

const PLANET_1_START = planet1Start()
/** The committed start scenario fast-forwards this far (its script). */
const SCENARIO_END_TICK = 7200

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  resetInput()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()
const isHeld = () => isLiveStepHeld(game())

function planet1Start(): Scenario {
  const text = readFileSync(
    new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
    'utf8',
  )
  return parseScenario(text).scenario as Scenario
}

function playLiveTicks(ticks: number): void {
  for (let done = 0; done < ticks; done++) game().advanceOneTick()
}

function pressKey(code: string): void {
  routeKeyChange({ code, isDown: true, isRepeat: false, isShiftHeld: false })
}

describe('live step: scenarios start at tick 0', () => {
  it('reaches the same end tick and digest after live ticks as with none played first', () => {
    game().applyScenario(PLANET_1_START)
    const withoutLiveTicks = takeSessionSnapshot()
    resetGameStore()
    playLiveTicks(96)
    game().applyScenario(PLANET_1_START)
    const afterLiveTicks = takeSessionSnapshot()
    expect(afterLiveTicks.tick).toBe(SCENARIO_END_TICK)
    expect(afterLiveTicks.digest).toBe(withoutLiveTicks.digest)
  })

  it('keeps a run debug-applied once a debug command was accepted before the scenario', () => {
    game().giveMoney('5')
    game().applyScenario({ scenarioVersion: 1, name: 'empty', worldSeed: 1, start: {} })
    expect(game().debugApplied).toBe(true)
  })
})

describe('live step: holding for play', () => {
  it('holds the live step at the end tick of an applied scenario', () => {
    game().applyScenario(PLANET_1_START)
    expect(game().liveStepHold).toBe('awaitingPlay')
    expect(isHeld()).toBe(true)
  })

  it("starts on the player's first key, bound or not", () => {
    game().applyScenario(PLANET_1_START)
    pressKey('KeyQ')
    expect(isHeld()).toBe(false)
  })

  it('starts on a touch or scripted action press, which travel the same path as keys', () => {
    game().applyScenario(PLANET_1_START)
    pressAction('lift')
    expect(isHeld()).toBe(false)
  })

  it('starts on a fastForward, after the scenario script has run', () => {
    game().applyScenario(PLANET_1_START)
    game().fastForward(600)
    expect(isHeld()).toBe(false)
    expect(takeSessionSnapshot().tick).toBe(SCENARIO_END_TICK + 600)
  })

  it('holds a restored snapshot at its tick until play', () => {
    const snapshot = takeSessionSnapshot()
    game().restoreSnapshot(snapshot)
    expect(game().liveStepHold).toBe('awaitingPlay')
    pressKey('KeyD')
    expect(isHeld()).toBe(false)
  })

  it('leaves the live step running when a scenario is refused', () => {
    const broken = { scenarioVersion: 1, name: 'bad', worldSeed: 1, start: { fuel: 1 } }
    expect(() => game().applyScenario(broken as unknown as Scenario)).toThrow()
    expect(isHeld()).toBe(false)
  })

  it('never holds a game started without a scenario', () => {
    expect(isHeld()).toBe(false)
  })
})

describe('live step: debug pause', () => {
  it('outlasts keys and fastForward until resume', () => {
    game().pauseLiveStep()
    pressKey('KeyD')
    game().fastForward(10)
    expect(game().liveStepHold).toBe('paused')
    game().resumeLiveStep()
    expect(isHeld()).toBe(false)
  })

  it('resumes a scenario waiting for play', () => {
    game().applyScenario(PLANET_1_START)
    game().resumeLiveStep()
    expect(isHeld()).toBe(false)
  })

  it('holds while settings are open, whatever the debug hold', () => {
    game().openSettings()
    expect(isHeld()).toBe(true)
  })
})

describe('live step: debug steps', () => {
  it('logs the steps as a debug command and starts a scenario waiting for play', () => {
    game().applyScenario(PLANET_1_START)
    const logged = sink.events.length
    game().prepareDebugSteps(30)
    expect(isHeld()).toBe(false)
    expect(
      sink.events.slice(logged).map(({ event, tick, data }) => ({ event, tick, data })),
    ).toEqual([
      {
        event: 'debug_command_applied',
        tick: SCENARIO_END_TICK,
        data: { command: 'step', args: { ticks: 30 } },
      },
    ])
  })
})
