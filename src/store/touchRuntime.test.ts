import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { Authority } from '../systems/authority/loopbackAuthority'
import { createStartingAuthority, resetGameStore, useGameStore } from './gameStore'
import { readActionStream, readVehicleIntent, resetInput, routeKeyChange } from './inputRuntime'
import {
  cancelSlotButton,
  holdSlotButton,
  isSlotCardShown,
  landStick,
  leaveScreen,
  liftStick,
  moveOnScreen,
  pressSlotButton,
  pressTouchButton,
  pushStick,
  releaseSlotButton,
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

// The power-up slot buttons (#217, G&V and GD on 7 Oct): a tap uses a filled slot at once, a hold
// of 400 ms shows the item card (#164) and uses nothing. A fake slice fills slot 1 only.
const SLOT_PROBE: SliceDefinition = {
  id: 'slot-probe',
  register: (r) =>
    r.inputReaction({
      id: 'slot-probe.use_1',
      actionId: 'use_slot_1',
      contexts: ['vehicle'],
      toIntent: () => ({ type: 'requestRescue', payload: {} }),
    }),
}

const runWithSlot = (play: () => void) => withRegistrations([SLOT_PROBE], () => runFresh(play))

describe('touch controls: power-up slot buttons (#217)', () => {
  it('submit one use on a tap of a filled slot, the same as Digit1, and show no card', () => {
    let isCardShown = true
    const onTouch = runWithSlot(() => {
      pressSlotButton('use_slot_1', 1000)
      isCardShown = isSlotCardShown('use_slot_1', 1120)
      releaseSlotButton('use_slot_1', 1120)
    })
    const onKeys = runWithSlot(() => {
      routeKeyChange(key('Digit1', true))
      routeKeyChange(key('Digit1', false))
    })
    expect(onTouch.commands).toEqual(['requestRescue'])
    expect(onTouch.commands).toEqual(onKeys.commands)
    expect(isCardShown).toBe(false)
  })

  it('show the card after a 400 ms hold and use nothing on release', () => {
    let isCardShown = false
    const held = runWithSlot(() => {
      pressSlotButton('use_slot_1', 1000)
      isCardShown = isSlotCardShown('use_slot_1', 1400)
      releaseSlotButton('use_slot_1', 1400)
    })
    expect(isCardShown).toBe(true)
    expect(held.commands).toEqual([])
    expect(held.stream).toEqual([])
  })

  it('use nothing for an empty slot or a cancelled press', () => {
    const empty = runWithSlot(() => {
      pressSlotButton('use_slot_2', 0)
      releaseSlotButton('use_slot_2', 100)
    })
    const cancelled = runWithSlot(() => {
      pressSlotButton('use_slot_1', 0)
      cancelSlotButton('use_slot_1')
      releaseSlotButton('use_slot_1', 100)
    })
    expect(empty.commands).toEqual([])
    expect(cancelled.commands).toEqual([])
    expect(isSlotCardShown('use_slot_1', 1000)).toBe(false)
  })
})

// A hold-to-use item's tile (ticket 332, the GD call on #285): pressed on finger-down, released
// on every lift or slide-off however long the finger was down, as its key would be. The fake
// slice answers slot 1's press and release with kernel commands.
const HOLD_PROBE: SliceDefinition = {
  id: 'hold-probe',
  register: (r) =>
    r.inputReaction({
      id: 'hold-probe.use_1',
      actionId: 'use_slot_1',
      contexts: ['vehicle'],
      toIntent: () => ({ type: 'requestRescue', payload: {} }),
      toReleaseIntent: () => ({ type: 'quickService', payload: {} }),
    }),
}

const runWithHeldSlot = (play: () => void) => withRegistrations([HOLD_PROBE], () => runFresh(play))

describe('touch controls: hold-to-use slot buttons (ticket 332)', () => {
  it.each([100, 600])('press on finger-down and release on a lift after %i ms', (heldMs) => {
    let pressedFirst: string[] = []
    const onTouch = runWithHeldSlot(() => {
      holdSlotButton('use_slot_1')
      pressedFirst = submitted.map((command) => command.type)
      releaseSlotButton('use_slot_1', 1000 + heldMs)
    })
    expect(pressedFirst).toEqual(['requestRescue'])
    expect(onTouch.commands).toEqual(['requestRescue', 'quickService'])
  })

  it('release when the finger slides off, and only once when the pointer then leaves', () => {
    const slid = runWithHeldSlot(() => {
      holdSlotButton('use_slot_1')
      cancelSlotButton('use_slot_1')
      releaseSlotButton('use_slot_1', 100)
    })
    const lifted = runWithHeldSlot(() => {
      holdSlotButton('use_slot_1')
      releaseSlotButton('use_slot_1', 100)
      cancelSlotButton('use_slot_1')
    })
    expect(slid.commands).toEqual(['requestRescue', 'quickService'])
    expect(lifted.commands).toEqual(['requestRescue', 'quickService'])
  })

  it('press the same action stream and commands as Digit1 down and up (#173)', () => {
    const onTouch = runWithHeldSlot(() => {
      holdSlotButton('use_slot_1')
      releaseSlotButton('use_slot_1', 700)
    })
    const onKeys = runWithHeldSlot(() => {
      routeKeyChange(key('Digit1', true))
      routeKeyChange(key('Digit1', false))
    })
    expect(onTouch).toEqual(onKeys)
    expect(onTouch.stream).toEqual([
      { actionId: 'use_slot_1', isDown: true },
      { actionId: 'use_slot_1', isDown: false },
    ])
  })

  it('never shows the timed card for a held tile, whose panel decides the card itself', () => {
    let isCardShown = true
    runWithHeldSlot(() => {
      holdSlotButton('use_slot_1')
      isCardShown = isSlotCardShown('use_slot_1', 2000)
    })
    expect(isCardShown).toBe(false)
  })
})
