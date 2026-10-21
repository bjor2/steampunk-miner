import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, takeSessionSnapshot } from '../store/gameStore'
import { isHudCoverageShown, showHudCoverage } from '../ui/debug/hudCoverageSwitch'
import { createDebugApi } from './debugApi'

// Ticket 682: the coverage overlay is switched and read through the debug API only; presentation,
// so the session, its digest and the run log never see it.

let sink: MemorySink
const ui = () => createDebugApi().ui

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => {
  showHudCoverage(false)
  uninstallRunLog()
})

describe('debug api: HUD coverage overlay (ticket 682)', () => {
  it('shows no overlay in a run the debug API never switched on', () => {
    expect(isHudCoverageShown()).toBe(false)
  })

  it('switches the overlay on and off', () => {
    expect(ui().showHudCoverage(true)).toEqual({ ok: true })
    expect(isHudCoverageShown()).toBe(true)
    expect(ui().showHudCoverage(false)).toEqual({ ok: true })
    expect(isHudCoverageShown()).toBe(false)
  })

  it('refuses anything but true or false and leaves the overlay as it was', () => {
    const result = ui().showHudCoverage('yes')
    expect(result.ok).toBe(false)
    expect(isHudCoverageShown()).toBe(false)
  })

  it('refuses a coverage read before the shell has fitted a screen', () => {
    expect(ui().getHudCoverage()).toEqual({
      ok: false,
      problems: ['no screen has been fitted yet'],
    })
  })

  it('changes neither the session nor the run log', () => {
    const before = takeSessionSnapshot()
    const logged = [sink.events.length, sink.commands.length]
    ui().showHudCoverage(true)
    ui().getHudCoverage()
    expect(takeSessionSnapshot()).toEqual(before)
    expect([sink.events.length, sink.commands.length]).toEqual(logged)
  })
})
