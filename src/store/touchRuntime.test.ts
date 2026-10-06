import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { Authority } from '../systems/authority/loopbackAuthority'
import { createStartingAuthority, resetGameStore, useGameStore } from './gameStore'
import { readActionStream, readVehicleIntent, resetInput, routeKeyChange } from './inputRuntime'
import {
  landStick,
  leaveScreen,
  liftStick,
  moveOnScreen,
  pressTouchButton,
  pushStick,
  releaseTouchButton,
  resetTouch,
  touchScreen,
} from './touchRuntime'

let submitted: AuthorityCommand[]

function spyAuthority(): Authority {
  const real = createStartingAuthority()
  return {
    ...real,
    submit: (command) => {
      submitted.push(command)
      real.submit(command)
    },
  }
}

const game = () => useGameStore.getState()
const key = (code: string, isDown: boolean) => ({
  code,
  isDown,
  isRepeat: false,
  isShiftHeld: false,
})

/** Drive right, climb to the right, level out, stop, then dock: on the keys. */
function playOnKeys(): void {
  routeKeyChange(key('KeyD', true))
  routeKeyChange(key('KeyW', true))
  routeKeyChange(key('KeyW', false))
  routeKeyChange(key('KeyD', false))
  routeKeyChange(key('KeyE', true))
  routeKeyChange(key('KeyE', false))
}

/** The same run with the stick and the Interact button. */
function playOnTouch(): void {
  landStick(1, 100, 300)
  pushStick(1, 140, 300)
  pushStick(1, 130, 270)
  pushStick(1, 140, 300)
  liftStick(1)
  pressTouchButton('interact')
  releaseTouchButton('interact')
}

/** What a run submitted and pressed, from a fresh store. */
function runFresh(play: () => void) {
  submitted = []
  resetGameStore(spyAuthority())
  resetInput()
  resetTouch()
  play()
  return {
    stream: [...readActionStream()],
    commands: submitted.map((command) => command.type),
    mode: game().vehicle.mode,
  }
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

describe('touch controls (#173)', () => {
  it('press the same action stream and submit the same commands as the matching keys', () => {
    const onKeys = runFresh(playOnKeys)
    const onTouch = runFresh(playOnTouch)
    expect(onTouch).toEqual(onKeys)
    expect(onTouch.stream.map((edge) => `${edge.actionId}${edge.isDown ? '+' : '-'}`)).toEqual([
      'aim_right+',
      'lift+',
      'lift-',
      'aim_right-',
      'interact+',
    ])
    expect(onTouch.mode).toBe('docked')
  })

  it('hold a diagonal as W then A would, and let go of everything when the thumb lifts', () => {
    runFresh(() => {
      landStick(1, 100, 300)
      pushStick(1, 70, 270)
    })
    expect(readVehicleIntent()).toMatchObject({ moveX: -1, lift: true })
    liftStick(1)
    expect(readVehicleIntent()).toMatchObject({ moveX: 0, lift: false })
  })

  it('ignore a second thumb while the stick is held', () => {
    runFresh(() => {
      landStick(1, 100, 300)
      landStick(2, 300, 300)
      pushStick(2, 260, 300)
    })
    expect(readActionStream()).toEqual([])
  })

  it('zoom in a step each time a pinch spreads by 1.25, as zoom_in would', () => {
    runFresh(() => {
      touchScreen(1, { x: 400, y: 200, atMs: 0 })
      touchScreen(2, { x: 500, y: 200, atMs: 10 })
      moveOnScreen(2, 520, 200)
      moveOnScreen(2, 530, 200)
      leaveScreen(1)
      leaveScreen(2)
    })
    expect(game().prefs.viewShortAxisMetres).toBeCloseTo(12 / 1.25, 9)
  })

  it('reset the zoom on a double tap, as 0 would', () => {
    runFresh(() => {
      game().setViewShortAxis(20)
      touchScreen(1, { x: 400, y: 200, atMs: 0 })
      leaveScreen(1)
      touchScreen(1, { x: 405, y: 204, atMs: 200 })
      leaveScreen(1)
    })
    expect(game().prefs.viewShortAxisMetres).toBe(12)
  })
})

describe('touch controls: showing and hiding (#173)', () => {
  it('hide on a key and show again on the next touch', () => {
    runFresh(() => game().showTouchControls())
    expect(game().isTouchControlsShown).toBe(true)
    routeKeyChange(key('KeyD', true))
    expect(game().isTouchControlsShown).toBe(false)
    game().showTouchControls()
    expect(game().isTouchControlsShown).toBe(true)
  })
})
