import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../store/authorityLink'
import { readAuthorityTick, resetGameStore, useGameStore } from '../store/gameStore'
import { resetInput, routeKeyChange } from '../store/inputRuntime'
import { isLiveStepHeld } from '../store/liveStepSlice'
import { stateDigest } from '../systems/authority/stateDigest'
import { parseScenario, type Scenario } from '../systems/scenario'
import {
  exposeLiveStepper,
  liveWorldProblems,
  readTickDilation,
  resetTickDilation,
  runFixedStepFrame,
  runLiveSteps,
  stepLiveWorld,
  type FrameClock,
  type LiveWorld,
} from './liveFixedStep'
import { stepBlend } from './stepBlend'

const SCENARIO_END_TICK = 7200

const game = () => useGameStore.getState()

/** The live game's world with no Rapier: each fixed step moves the authority one tick, as the loop does. */
const LIVE_WORLD: LiveWorld = {
  isHeld: () => isLiveStepHeld(game()),
  stepWorld: () => game().advanceOneTick(),
}

beforeEach(() => {
  resetGameStore()
  resetInput()
  resetTickDilation()
})

function planet1Start(): Scenario {
  const text = readFileSync(
    new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
    'utf8',
  )
  return parseScenario(text).scenario as Scenario
}

/** `seconds` of frames at `framesPerSecond`. */
function drawFrames(clock: FrameClock, seconds: number, framesPerSecond: number): void {
  for (let frame = 0; frame < seconds * framesPerSecond; frame++)
    runFixedStepFrame(clock, 1 / framesPerSecond, LIVE_WORLD)
}

describe('live fixed step', () => {
  it('advances no authority tick while a scenario waits for play, whatever the wall time', () => {
    game().applyScenario(planet1Start())
    const clock = { carried: 0 }
    drawFrames(clock, 120, 30)
    runFixedStepFrame(clock, 3600, LIVE_WORLD)
    expect(readAuthorityTick()).toBe(SCENARIO_END_TICK)
    expect(clock.carried).toBe(0)
  })

  it("runs again from the player's first key, a second of play at 30 and at 144 frames/s", () => {
    for (const framesPerSecond of [30, 144]) {
      resetGameStore()
      game().applyScenario(planet1Start())
      const clock = { carried: 0 }
      drawFrames(clock, 5, framesPerSecond)
      routeKeyChange({ code: 'KeyQ', isDown: true, isRepeat: false, isShiftHeld: false })
      drawFrames(clock, 1, framesPerSecond)
      expect(readAuthorityTick()).toBe(SCENARIO_END_TICK + 60)
    }
  })

  it('steps a debug step count at once, held or not, and draws the last step whole', () => {
    game().pauseLiveStep()
    runLiveSteps(45, LIVE_WORLD)
    expect(readAuthorityTick()).toBe(45)
    expect(stepBlend.share).toBe(1)
  })

  it('refuses a debug step with no physics world mounted, and steps the mounted one', () => {
    expect(liveWorldProblems()).toEqual(['no physics world is running'])
    const unmount = exposeLiveStepper((ticks) => runLiveSteps(ticks, LIVE_WORLD))
    stepLiveWorld(12)
    unmount()
    expect(readAuthorityTick()).toBe(12)
    expect(liveWorldProblems()).toEqual(['no physics world is running'])
  })
})

/** The planet-1 start, playing from a held key. */
function startPlaying(): void {
  game().applyScenario(planet1Start())
  routeKeyChange({ code: 'KeyQ', isDown: true, isRepeat: false, isShiftHeld: false })
}

describe('live tick dilation (ticket 480)', () => {
  it('counts the ticks a frame past the cap drops, and none for frames within it', () => {
    startPlaying()
    const clock = { carried: 0 }
    drawFrames(clock, 2, 60)
    runFixedStepFrame(clock, 0.5, LIVE_WORLD)
    expect(readTickDilation().ticksDroppedByCap).toBe(0)
    runFixedStepFrame(clock, 0.75, LIVE_WORLD)
    expect(readTickDilation().ticksDroppedByCap).toBe(15)
  })

  it('counts no drop for a held frame, however long', () => {
    game().applyScenario(planet1Start())
    runFixedStepFrame({ carried: 0 }, 3600, LIVE_WORLD)
    expect(readTickDilation().ticksDroppedByCap).toBe(0)
  })

  it('reaches the same digest at the same tick as plain steps, the drops only slowing the clock', () => {
    startPlaying()
    const clock = { carried: 0 }
    drawFrames(clock, 1, 60)
    for (let hitch = 0; hitch < 8; hitch++) runFixedStepFrame(clock, 0.75, LIVE_WORLD)
    drawFrames(clock, 1, 30)
    const ticks = readAuthorityTick() - SCENARIO_END_TICK
    const digest = stateDigest(readAuthorityState())
    expect(readTickDilation().ticksDroppedByCap).toBe(8 * 15)

    resetGameStore()
    resetInput()
    startPlaying()
    runLiveSteps(ticks, LIVE_WORLD)
    expect(stateDigest(readAuthorityState())).toBe(digest)
  })
})
