import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { createDebugApi } from './debugApi'

// `ui.setDevFlags` (ticket 548, the TD ruling on #547 section 4): a spec sets flags through the
// command path the panel uses, without the panel and without localStorage.

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: dev flags', () => {
  it('reads a fresh session on the shipped flags, unmarked, with nothing remembered', () => {
    const read = createDebugApi().ui.getDevFlags()
    expect(read).toMatchObject({
      ok: true,
      flags: { client: { flags: DEV_FLAGS, pending: {} }, isEverSet: false, overrides: {} },
    })
  })

  it('sets the authority flags through a logged debug.setFlags and the client ones locally', () => {
    const debug = createDebugApi()
    const choice = { 'drill.exactCarry': false, 'drill.reportEveryTick': false }
    expect(debug.ui.setDevFlags(choice)).toEqual({ ok: true })
    expect(sink.commands.map((command) => command.type)).toEqual(['debug.setFlags'])
    const read = debug.ui.getDevFlags()
    if (!read.ok) throw new Error(read.problems.join('; '))
    expect(read.flags.authority['drill.exactCarry']).toBe(false)
    expect(read.flags.client.flags['drill.reportEveryTick']).toBe(false)
    expect(read.flags.isEverSet).toBe(true)
  })

  it('shows a drill.sweptCut flip as pending until the loop finds the drill idle', () => {
    const debug = createDebugApi()
    debug.ui.setDevFlags({ 'drill.sweptCut': false })
    const read = debug.ui.getDevFlags()
    expect(read).toMatchObject({
      ok: true,
      flags: { client: { pending: { 'drill.sweptCut': false } } },
    })
  })

  it('refuses a choice naming a number or an unknown flag whole, sending nothing', () => {
    const debug = createDebugApi()
    const refused = debug.ui.setDevFlags({
      'drill.reportEveryTick': false,
      'drill.perLevel': 1.243,
    })
    expect(refused).toEqual({ ok: false, problems: ['"drill.perLevel" is not a dev flag'] })
    expect(debug.ui.setDevFlags('on')).toMatchObject({ ok: false })
    expect(sink.commands).toEqual([])
  })
})
