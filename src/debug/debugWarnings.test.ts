import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { readHudModel } from '../store/screenReads'
import { followHudWarnings } from '../ui/hud/useWarningWatch'
import { createDebugApi } from './debugApi'

// Ticket 685: the warning layer is read through the debug API, so a recorded run can show each
// ladder tier fired exactly once; presentation, so the session, its digest and the run log never
// see the read.

let sink: MemorySink
const debug = () => createDebugApi()

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: warning layer (ticket 685)', () => {
  it('reads no glow and no firing on a fresh run', () => {
    expect(debug().ui.getWarnings()).toEqual({
      ok: true,
      warnings: {
        glow: { tier: 'ok', readoutId: null },
        watch: useGameStore.getState().warningWatch,
        fired: [],
      },
    })
  })

  it('reads the hull tier the HUD fired after the hull is set low, once however often it re-reads', () => {
    expect(debug().setHull('10')).toEqual({ ok: true })
    followHudWarnings(readHudModel())
    followHudWarnings(readHudModel())
    const reading = debug().ui.getWarnings()
    expect(reading.ok && reading.warnings.glow).toEqual({ tier: 'critical', readoutId: 'hull' })
    expect(reading.ok && reading.warnings.fired.map((firing) => firing.tier)).toEqual(['critical'])
  })

  it('changes no session, digest or log line when read', () => {
    const before = takeSessionSnapshot()
    const logged = [sink.events.length, sink.commands.length]
    debug().ui.getWarnings()
    expect(takeSessionSnapshot()).toEqual(before)
    expect([sink.events.length, sink.commands.length]).toEqual(logged)
  })
})
