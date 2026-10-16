import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  readTickDilation,
  resetTickDilation,
  runFixedStepFrame,
  type FrameClock,
  type LiveWorld,
} from '../physics/liveFixedStep'
import { parseScenario, type Scenario } from '../systems/scenario'
import { resetGameStore, useGameStore } from './gameStore'
import { resetInput, routeKeyChange } from './inputRuntime'
import { isLiveStepHeld } from './liveStepSlice'

const game = () => useGameStore.getState()

const LIVE_WORLD: LiveWorld = {
  isHeld: () => isLiveStepHeld(game()),
  stepWorld: () => game().advanceOneTick(),
}

/** 0.6 s frames: 36 ticks due, the cap runs 30 and drops 6 (17%). */
const OVERLOADED_FRAME = 0.6

function startPlaying(): void {
  const text = readFileSync(
    new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
    'utf8',
  )
  game().applyScenario(parseScenario(text).scenario as Scenario)
  routeKeyChange({ code: 'KeyQ', isDown: true, isRepeat: false, isShiftHeld: false })
}

/** Frames as the scene draws them: the fixed step, then the chip follows the watch. */
function drawSeconds(clock: FrameClock, seconds: number, frameSeconds: number): void {
  const count = Math.round(seconds / frameSeconds)
  for (let frame = 0; frame < count; frame++) {
    runFixedStepFrame(clock, frameSeconds, LIVE_WORLD)
    game().followSlowDevice(readTickDilation())
  }
}

beforeEach(() => {
  resetGameStore()
  resetInput()
  resetTickDilation()
})

describe('slow device chip (ticket 480)', () => {
  it('stays hidden while the frames keep up', () => {
    startPlaying()
    drawSeconds({ carried: 0 }, 10, 1 / 30)
    expect(game().isSlowDeviceChipShown).toBe(false)
  })

  it('shows after five seconds of dropped ticks and clears after five steady seconds', () => {
    startPlaying()
    const clock = { carried: 0 }
    drawSeconds(clock, 4.8, OVERLOADED_FRAME)
    expect(game().isSlowDeviceChipShown).toBe(false)
    drawSeconds(clock, 1.2, OVERLOADED_FRAME)
    expect(game().isSlowDeviceChipShown).toBe(true)
    drawSeconds(clock, 4, 1 / 60)
    expect(game().isSlowDeviceChipShown).toBe(true)
    drawSeconds(clock, 1, 1 / 60)
    expect(game().isSlowDeviceChipShown).toBe(false)
  })
})
