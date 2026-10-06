import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { resetGameStore, useGameStore } from '../store/gameStore'
import type { CommandRule } from '../systems/authority/commandRule'
import { add, fromSafeInteger, toCanonical } from '../systems/money'
import { createDebugApi } from './debugApi'
import { submitSliceDebugCommand } from './sliceDebugCommands'

// A fake slice's state-changing debug action, as a real slice's debug.ts writes one.
declare module '../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'debug.example.grantChimes': { chimes: number }
  }
}

const GRANT_CHIMES: CommandRule<'debug.example.grantChimes'> = {
  fields: { chimes: 'wholeNumber' },
  apply: (state, { playerId, payload }) => {
    const player = state.players[playerId]
    const wallet = add(player.wallet, fromSafeInteger(payload.chimes))
    return {
      state: { ...state, players: { ...state.players, [playerId]: { ...player, wallet } } },
      events: [{ type: 'MoneyChanged', from: toCanonical(player.wallet), to: toCanonical(wallet) }],
    }
  },
}

const EXAMPLE_SLICE: SliceDefinition = {
  id: 'example',
  register(r) {
    r.commandRules({ 'debug.example.grantChimes': GRANT_CHIMES })
    r.debugActions({
      grantChimes: (chimes) =>
        submitSliceDebugCommand({
          type: 'debug.example.grantChimes',
          payload: { chimes: chimes as number },
        }),
    })
  },
}

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})
afterEach(() => uninstallRunLog())

function grantChimes(chimes: unknown) {
  return withRegistrations([EXAMPLE_SLICE], () =>
    createDebugApi().features.example.grantChimes(chimes),
  )
}

describe('slice debug commands', () => {
  it('changes state through a debug.<slice> command that is recorded for replay', () => {
    const before = useGameStore.getState().money
    expect(grantChimes(2)).toEqual({ ok: true })
    expect(useGameStore.getState().money).toEqual(add(before, fromSafeInteger(2)))
    expect(sink.commands).toMatchObject([
      { type: 'debug.example.grantChimes', payload: { chimes: 2 } },
    ])
  })

  it('logs debug_command_applied with the command and its arguments', () => {
    grantChimes(2)
    expect(sink.events.filter(({ event }) => event === 'debug_command_applied')).toMatchObject([
      { data: { command: 'debug.example.grantChimes', args: { chimes: 2 } } },
    ])
  })

  it('answers a refused call with its problems and sends nothing', () => {
    expect(grantChimes(-1)).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('chimes')],
    })
    expect(sink.commands).toEqual([])
    expect(sink.events).toEqual([])
  })
})
