import { afterEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { advanceAuthorityTo, readAuthorityState, submitCommand } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { resetInput, routeKeyChange } from '../../../store/inputRuntime'
import {
  holdSlotButton,
  isSlotCardShown,
  releaseSlotButton,
  resetTouch,
} from '../../../store/touchRuntime'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { weakTunnelIntents } from '../../../systems/authority/collapse/collapseFixtures'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createLoopbackAuthority } from '../../../systems/authority/loopbackAuthority'
import { WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { bracedBlocksOf, LODE_CLAMP_ID } from '../systems/lodeClamp'

// Letting go of the lode clamp on the keys and on touch (G&V feel line 2 and the GD call on #285,
// ticket 285), played through the store's input and touch runtimes on the loaded slices: the
// collapse specs' weak band-2 tunnel (seed 83921) warns as the clamp is slotted, the clamp is held
// past the 400 ms card press, and its release starts every braced block's fresh 60-tick warning.
// No gamepad adapter exists yet (#33); a gamepad's button-up will reach the same `releaseAction`.

const WINDUP_TICKS = 6
/** Past the 400 ms long press that opens an item card (#164): 30 ticks at 60 a second. */
const HELD_TICKS = 30
const PRESSED_AT_MS = 1000
const LIFTED_AT_MS = PRESSED_AT_MS + 600

let sink: MemorySink

const game = () => useGameStore.getState()
const tickNow = () => readAuthorityState().tick
const stepTicks = (ticks: number) => advanceAuthorityTo(tickNow() + ticks)
const digit1 = (isDown: boolean) => ({
  code: 'Digit1',
  isDown,
  isRepeat: false,
  isShiftHeld: false,
})

/** Runs `play` on a fresh store over the weak tunnel with the clamp in slot 1. */
function inClampTunnel<T>(play: () => T): T {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_285', sink, secondsSinceStart: () => 0 }))
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: WORLD_SEED,
    playerIds: [useGameStore.getState().playerId],
  })
  resetGameStore(createLoopbackAuthority(start))
  resetInput()
  resetTouch()
  submitCommand(game().playerId, setVehicleLoadoutCommand({ 'powerup.1': LODE_CLAMP_ID }))
  weakTunnelIntents().forEach((intent) => submitCommand(game().playerId, intent))
  stepTicks(1)
  return play()
}

afterEach(() => uninstallRunLog())

const slotCommands = () =>
  sink.commands
    .filter((command) => command.type.startsWith('power-up-core.'))
    .map((command) => `${command.type}@${command.tick}`)

const linesNamed = (event: string) => sink.events.filter((line) => String(line.event) === event)

/** The collapsing entries among `blocks`, as they stand now. */
function bracedEntries(blocks: readonly string[]) {
  return readAuthorityState().collapse.blocks.filter((entry) => blocks.includes(entry.block))
}

/** The warning blocks the held field braces now; at least one in the tunnel. */
function bracedNow(): string[] {
  const claimed = bracedBlocksOf(readAuthorityState(), game().playerId)
  const braced = bracedEntries(claimed).filter((entry) => entry.isBraced === true)
  expect(braced.length).toBeGreaterThan(0)
  return braced.map((entry) => entry.block)
}

/** The logged `event` lines naming one of `blocks`, as `[tick, block]`. */
function blockLines(event: string, blocks: readonly string[]) {
  return linesNamed(event)
    .map((line) => [line.tick, (line.data as { block: string }).block] as const)
    .filter(([, block]) => blocks.includes(block))
}

/**
 * What every release path must leave: one release on its tick, the field ended, a fresh warning
 * logged on every braced block, and no refill before the 60 ticks are out.
 */
function expectReleasedOn(upTick: number, braced: readonly string[]): void {
  expect(slotCommands().filter((command) => command.includes('release'))).toEqual([
    `power-up-core.release_power_up@${upTick}`,
  ])
  expect(linesNamed('terrain-tools.magnet_used')).toHaveLength(1)
  const fresh = blockLines('collapse_warning', braced).filter(([tick]) => tick === upTick)
  expect(fresh.map(([, block]) => block).sort()).toEqual([...braced].sort())
  stepTicks(COLLAPSE_WARN_TICKS - 1)
  expect(blockLines('collapse', braced)).toEqual([])
  stepTicks(1)
  expect(blockLines('collapse', braced).map(([tick]) => tick)).toEqual(
    braced.map(() => upTick + COLLAPSE_WARN_TICKS),
  )
}

describe('lode clamp release on the keys', () => {
  it('sends one release_power_up on the key-up tick and warns every braced block afresh', () => {
    inClampTunnel(() => {
      routeKeyChange(digit1(true))
      stepTicks(WINDUP_TICKS + HELD_TICKS)
      const braced = bracedNow()
      const upTick = tickNow()
      routeKeyChange(digit1(false))
      expectReleasedOn(upTick, braced)
    })
  })
})

describe('lode clamp release on touch', () => {
  it('keeps the card closed and the brace on past 400 ms, then releases on the lift', () => {
    inClampTunnel(() => {
      holdSlotButton('use_slot_1')
      stepTicks(WINDUP_TICKS + HELD_TICKS)
      expect(isSlotCardShown('use_slot_1', LIFTED_AT_MS)).toBe(false)
      const braced = bracedNow()
      const upTick = tickNow()
      releaseSlotButton('use_slot_1', LIFTED_AT_MS)
      expectReleasedOn(upTick, braced)
    })
  })
})
