import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { exposeLiveStepper, runLiveSteps } from '../physics/liveFixedStep'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { isLiveStepHeld } from '../store/liveStepSlice'
import { createDebugApi } from './debugApi'

let sink: MemorySink
let unmountWorld = () => {}

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => {
  unmountWorld()
  uninstallRunLog()
})

const game = () => useGameStore.getState()

/** A mounted world with no Rapier: each fixed step moves the authority one tick, as the loop does. */
function mountWorld(): void {
  const world = { isHeld: () => isLiveStepHeld(game()), stepWorld: () => game().advanceOneTick() }
  unmountWorld = exposeLiveStepper((ticks) => runLiveSteps(ticks, world))
}

describe('debug api: live time', () => {
  it('pauses the live step until resume and answers where the authority stands', () => {
    const debug = createDebugApi()
    expect(debug.pause()).toMatchObject({ ok: true, tick: 0 })
    expect(isLiveStepHeld(game())).toBe(true)
    expect(debug.resume()).toMatchObject({ ok: true, tick: 0 })
    expect(isLiveStepHeld(game())).toBe(false)
  })

  it('steps the running world by whole fixed steps while paused and logs the call', () => {
    mountWorld()
    const debug = createDebugApi()
    debug.pause()
    expect(debug.step(90)).toMatchObject({ ok: true, tick: 90 })
    expect(isLiveStepHeld(game())).toBe(true)
    expect(sink.events.map(({ event, data }) => ({ event, data }))).toContainEqual({
      event: 'debug_command_applied',
      data: { command: 'step', args: { ticks: 90 } },
    })
  })

  it('refuses a bad step count or a missing world and changes nothing', () => {
    const debug = createDebugApi()
    expect(debug.step(0)).toEqual({
      ok: false,
      problems: [
        'ticks must be a whole number from 1 to 3600, got 0',
        'no physics world is running',
      ],
    })
    expect(debug.step(1.5)).toMatchObject({ ok: false })
    expect(sink.events).toEqual([])
    expect(debug.snapshot()).toMatchObject({ snapshot: { tick: 0 } })
  })
})
