import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { replayRun } from '../systems/replay/replayRun'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'
import { readActionStream, resetInput, routeKeyChange } from './inputRuntime'
import {
  landStick,
  liftStick,
  pressTouchButton,
  pushStick,
  releaseTouchButton,
  resetTouch,
} from './touchRuntime'

// Determinism layer (b) of the TD's section 1 on #470 (#474): the same play on the keys and on the
// touch controls, ticks apart through `fastForward`, logs the same commands, and replaying them
// in render frames of 30 and of 144 a second gives the live session's digests.

/** The store's starting planet seed (`STARTING_PLANET` in gameStore.ts). */
const WORLD_SEED = 1
const STEP_TICKS = 20

const key = (code: string, isDown: boolean) => ({
  code,
  isDown,
  isRepeat: false,
  isShiftHeld: false,
})

/** Drive right, climb, drive right again and stop; dock; sell at the dock. On the keys. */
const KEY_STEPS: readonly (() => void)[] = [
  () => routeKeyChange(key('KeyD', true)),
  () => {
    routeKeyChange(key('KeyD', false))
    routeKeyChange(key('KeyW', true))
  },
  () => {
    routeKeyChange(key('KeyW', false))
    routeKeyChange(key('KeyD', true))
  },
  () => routeKeyChange(key('KeyD', false)),
  () => {
    routeKeyChange(key('KeyE', true))
    routeKeyChange(key('KeyE', false))
  },
  () => {
    routeKeyChange(key('KeyQ', true))
    routeKeyChange(key('KeyQ', false))
  },
]

/**
 * The same play with the stick pushed to its rim, where it drives as the keys do (ticket 791), and
 * the cluster's Interact and quick service buttons.
 */
const TOUCH_STEPS: readonly (() => void)[] = [
  () => {
    landStick(1, 100, 300)
    pushStick(1, 156, 300)
  },
  () => pushStick(1, 100, 244),
  () => pushStick(1, 156, 300),
  () => liftStick(1),
  () => tapButton('interact'),
  () => tapButton('quick_service'),
]

/** The four held move actions, which the analog stick drives past (ticket 791). */
function isMoveAction(action: string): boolean {
  return ['aim_left', 'aim_right', 'aim_down', 'lift'].includes(action)
}

let sink: MemorySink

function tapButton(action: 'interact' | 'quick_service'): void {
  pressTouchButton(action)
  releaseTouchButton(action)
}

/** Plays the steps `STEP_TICKS` apart on a fresh store: what it pressed, logged and ended as. */
function playLive(steps: readonly (() => void)[]) {
  resetGameStore()
  resetInput()
  resetTouch()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_474', sink, secondsSinceStart: () => 0 }))
  steps.forEach((step) => {
    step()
    useGameStore.getState().fastForward(STEP_TICKS)
  })
  const snapshot = takeSessionSnapshot()
  return {
    stream: [...readActionStream()],
    commands: [...sink.commands],
    end: { tick: snapshot.tick, digest: snapshot.digest },
  }
}

function replayedDigestsAt(run: ReturnType<typeof playLive>, framesPerSecond: number) {
  const replay = replayRun(WORLD_SEED, run.commands, {
    playerIds: [useGameStore.getState().playerId],
    endTick: run.end.tick,
    framesPerSecond,
  })
  return replay.digests
}

beforeEach(() => resetGameStore())

afterEach(() => uninstallRunLog())

describe('touch replay (#474)', () => {
  it('logs the same commands from the touch controls as from the keys, the stick pressing no move action', () => {
    const onKeys = playLive(KEY_STEPS)
    const onTouch = playLive(TOUCH_STEPS)
    expect(onTouch.stream).toEqual(onKeys.stream.filter((edge) => !isMoveAction(edge.actionId)))
    expect(onTouch.commands).toEqual(onKeys.commands)
    expect(onTouch.commands.map((command) => command.type)).toEqual(['dock', 'quickService'])
  })

  it('replays both to the live digests at 30 and at 144 frames a second', () => {
    const onKeys = playLive(KEY_STEPS)
    const onTouch = playLive(TOUCH_STEPS)
    const replays = [onKeys, onTouch].flatMap((run) =>
      [30, 144].map((framesPerSecond) => replayedDigestsAt(run, framesPerSecond)),
    )
    replays.forEach((digests) => expect(digests).toEqual(replays[0]))
    expect(replays[0].at(-1)).toEqual({ ...onKeys.end, scope: 'end' })
    expect(onTouch.end).toEqual(onKeys.end)
  })
})
