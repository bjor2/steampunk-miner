import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { createDebugApi } from './debugApi'

// The premium ledger's scenario API (ticket 844): set as a logged `debug.*` command, refused never
// trimmed, and read without a log line.

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: premium ledger (ticket 844)', () => {
  it('reads an empty ledger on a fresh run', () => {
    expect(createDebugApi().premiumLedger()).toEqual({ ok: true, counts: [] })
  })

  it('refuses counts the empty hold cannot hold, listing why and changing nothing', () => {
    const debug = createDebugApi()
    expect(debug.setPremiumLedger({ '2:1:1:honey-amber-quartzine': '1' })).toEqual({
      ok: false,
      problems: ['counts: tier 2 counts more premium units than the hold holds'],
    })
    expect(debug.premiumLedger()).toEqual({ ok: true, counts: [] })
  })

  it('sets the ledger as a logged debug command', () => {
    expect(createDebugApi().setPremiumLedger({})).toEqual({ ok: true })
    expect(sink.events.map((event) => event.event)).toContain('debug_command_applied')
  })
})
