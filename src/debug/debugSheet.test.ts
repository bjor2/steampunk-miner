import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { createDebugApi } from './debugApi'

// Ticket 686: the base sheet is opened, closed and read through the debug API like any tab opener;
// presentation, so the session, its digest and the run log never see it.

let sink: MemorySink
const ui = () => createDebugApi().ui

const PROBE: SliceDefinition = {
  id: 'sheet-probe',
  register: (r) =>
    r.sheetTab({
      id: 'sheet-probe.hold',
      title: 'Hold',
      order: 1,
      isShownOn: () => true,
      Panel: () => createElement('span'),
    }),
}

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: base sheet (ticket 686)', () => {
  it('opens the sheet on a registered tab and reads it back, then closes it', () => {
    withRegistrations([PROBE], () => {
      expect(ui().openSheet('sheet-probe.hold')).toEqual({ ok: true })
      const reading = ui().getSheet()
      expect(reading.ok && reading.sheet.openTabId).toBe('sheet-probe.hold')
      expect(reading.ok && reading.sheet.shownTabIds).toEqual([
        'sheet-probe.hold',
        'hold',
        'ledger',
      ])
      expect(ui().closeSheet()).toEqual({ ok: true })
      const shut = ui().getSheet()
      expect(shut.ok && shut.sheet.openTabId).toBeNull()
    })
  })

  it('refuses a tab no slice registered and leaves the sheet shut', () => {
    withRegistrations([PROBE], () => {
      const result = ui().openSheet('sheet-probe.gone')
      expect(result.ok).toBe(false)
      const reading = ui().getSheet()
      expect(reading.ok && reading.sheet.openTabId).toBeNull()
    })
  })

  it('changes no session, digest or log line', () => {
    const before = takeSessionSnapshot()
    const logged = [sink.events.length, sink.commands.length]
    withRegistrations([PROBE], () => {
      ui().openSheet('sheet-probe.hold')
      ui().closeSheet()
    })
    expect(takeSessionSnapshot()).toEqual(before)
    expect([sink.events.length, sink.commands.length]).toEqual(logged)
  })

  it('shuts the bay’s menu in place, the bay still docked and nothing sent (ticket 734)', () => {
    useGameStore.getState().teleportToDock('upgrade')
    useGameStore.getState().openSheetAsBayMenu('hold')
    const opened = ui().getSheet()
    expect(opened.ok && opened.sheet.isBayMenu).toBe(true)
    const commands = sink.commands.length
    expect(ui().closeSheet()).toEqual({ ok: true })
    const shut = ui().getSheet()
    expect(shut.ok && [shut.sheet.openTabId, shut.sheet.isBayMenu]).toEqual([null, false])
    expect(useGameStore.getState().vehicle.mode).toBe('docked')
    expect(sink.commands.length).toBe(commands)
  })
})
