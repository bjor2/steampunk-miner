import { afterEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { advanceAuthorityTo, readAuthorityState, submitCommand } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { readActionStream, resetInput, routeKeyChange } from '../../../store/inputRuntime'
import { cancelSlotButton, releaseSlotButton, resetTouch } from '../../../store/touchRuntime'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { GROUND, poseAbove } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { FAKE } from '../fakeItems'
import {
  CLAMP,
  CLAMP_COOLDOWN_TICKS,
  CLAMP_WINDUP_TICKS,
  clampNotesOf,
  withHoldItems,
} from '../fakeHoldItem'
import { isSlotInUse } from '../systems/slotRelease'
import { pressSlotTile } from './slotPress'
import { readSlotButtons } from './slotColumnReads'

// Letting go of a slot on the keys and on touch (ticket 332, the GD call on #285), played through
// the store's input and touch runtimes on the core slice with the fake clamp in slot 1 and the
// fake charged item (no `release`) in slot 2.

let sink: MemorySink

const game = () => useGameStore.getState()
const tickNow = () => readAuthorityState().tick
const stepTicks = (ticks: number) => advanceAuthorityTo(tickNow() + ticks)
const key = (code: string, isDown: boolean) => ({
  code,
  isDown,
  isRepeat: false,
  isShiftHeld: false,
})

/** Runs `play` on a fresh store with the clamp and the fake charged item slotted, at rest. */
function inHeldStore<T>(play: () => T): T {
  return withHoldItems(() => {
    sink = createMemorySink()
    installRunLog(createRunLog({ runId: 'run_332', sink, secondsSinceStart: () => 0 }))
    resetGameStore()
    resetInput()
    resetTouch()
    const loadout = { 'powerup.1': CLAMP, 'powerup.2': FAKE.charged }
    submitCommand(game().playerId, setVehicleLoadoutCommand(loadout))
    submitCommand(game().playerId, poseAbove(GROUND, FACING.right))
    stepTicks(1)
    return play()
  })
}

afterEach(() => uninstallRunLog())

/** The power-up commands sent, with their ticks. */
const slotCommands = () =>
  sink.commands
    .filter((command) => command.type.startsWith('power-up-core.'))
    .map((command) => `${command.type}@${command.tick}`)

const releasedLines = () =>
  sink.events.filter((line) => String(line.event) === 'power-up-core.power_up_released')

const tileOf = (slot: string) => {
  const button = readSlotButtons().find((candidate) => candidate.slot === slot)
  if (button === undefined) throw new Error(`no tile for ${slot}`)
  return button
}

/** The press that starts the clamp's use, then past its act so the hold is live. */
function holdClampOnKey(): number {
  routeKeyChange(key('Digit1', true))
  stepTicks(CLAMP_WINDUP_TICKS + 4)
  return tickNow()
}

describe('slot release on the keys', () => {
  it('sends use_power_up on key-down and release_power_up on the key-up tick', () => {
    inHeldStore(() => {
      const downTick = tickNow()
      const upTick = holdClampOnKey()
      routeKeyChange(key('Digit1', false))
      expect(slotCommands()).toEqual([
        `power-up-core.use_power_up@${downTick}`,
        `power-up-core.release_power_up@${upTick}`,
      ])
      expect(clampNotesOf(readAuthorityState(), game().playerId).releaseTicks).toEqual([upTick])
      expect(releasedLines()).toMatchObject([{ data: { itemId: CLAMP, slot: 'powerup.1' } }])
    })
  })

  it('sends nothing on key-up for a slot whose item has no release', () => {
    inHeldStore(() => {
      routeKeyChange(key('Digit2', true))
      routeKeyChange(key('Digit2', false))
      expect(slotCommands()).toEqual([`power-up-core.use_power_up@${tickNow()}`])
      expect(readActionStream()).toEqual([{ actionId: 'use_slot_2', isDown: true }])
    })
  })
})

describe('slot release on touch', () => {
  it.each([100, 600])('presses on finger-down and releases on a lift after %i ms', (heldMs) => {
    inHeldStore(() => {
      const downTick = tickNow()
      pressSlotTile(tileOf('powerup.1'), 1000)
      stepTicks(CLAMP_WINDUP_TICKS + 4)
      releaseSlotButton('use_slot_1', 1000 + heldMs)
      expect(slotCommands()).toEqual([
        `power-up-core.use_power_up@${downTick}`,
        `power-up-core.release_power_up@${tickNow()}`,
      ])
      expect(releasedLines()).toHaveLength(1)
    })
  })

  it('releases when the finger slides off the tile', () => {
    inHeldStore(() => {
      pressSlotTile(tileOf('powerup.1'), 1000)
      stepTicks(CLAMP_WINDUP_TICKS + 4)
      cancelSlotButton('use_slot_1')
      expect(clampNotesOf(readAuthorityState(), game().playerId)).toMatchObject({
        hold: null,
        releaseTicks: [tickNow()],
      })
    })
  })

  it('sends the same commands and action stream as the keys (#173)', () => {
    const onKeys = inHeldStore(() => {
      holdClampOnKey()
      routeKeyChange(key('Digit1', false))
      return { commands: slotCommands(), stream: [...readActionStream()] }
    })
    const onTouch = inHeldStore(() => {
      pressSlotTile(tileOf('powerup.1'), 1000)
      stepTicks(CLAMP_WINDUP_TICKS + 4)
      releaseSlotButton('use_slot_1', 1500)
      return { commands: slotCommands(), stream: [...readActionStream()] }
    })
    expect(onTouch).toEqual(onKeys)
  })

  it('keeps the card closed and the hold live past 400 ms once the press started the use', () => {
    inHeldStore(() => {
      expect(pressSlotTile(tileOf('powerup.1'), 1000)).toEqual({ mayShowCard: false })
      stepTicks(30)
      expect(isSlotInUse(readAuthorityState(), game().playerId, 'powerup.1')).toBe(true)
      releaseSlotButton('use_slot_1', 1000 + 900)
      expect(slotCommands().at(-1)).toBe(`power-up-core.release_power_up@${tickNow()}`)
    })
  })

  it('still lets a long press open the card on a slot cooling down, or a tap item', () => {
    inHeldStore(() => {
      pressSlotTile(tileOf('powerup.1'), 1000)
      stepTicks(CLAMP_WINDUP_TICKS + 4)
      releaseSlotButton('use_slot_1', 1100)
      stepTicks(1)
      expect(tickNow()).toBeLessThan(CLAMP_COOLDOWN_TICKS)
      expect(pressSlotTile(tileOf('powerup.1'), 2000)).toEqual({ mayShowCard: true })
      releaseSlotButton('use_slot_1', 2500)
      expect(pressSlotTile(tileOf('powerup.2'), 3000)).toEqual({ mayShowCard: true })
    })
  })
})
