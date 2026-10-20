import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { createDebugApi } from './debugApi'

// `ui.setMaterialPopMode` (ticket 614, #442): a spec switches the pop mode without the panel.

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: material pop', () => {
  it('reads A on a fresh session', () => {
    expect(createDebugApi().ui.getMaterialPopMode()).toEqual({ ok: true, mode: 'A' })
  })

  it('switches to B, logged, without marking the run or changing the session', () => {
    const before = takeSessionSnapshot()
    expect(createDebugApi().ui.setMaterialPopMode('B')).toEqual({ ok: true })
    expect(useGameStore.getState().materialPopMode).toBe('B')
    expect(sink.events.map((event) => event.event)).toEqual(['material_pop_mode_set'])
    expect(takeSessionSnapshot()).toEqual(before)
    expect(useGameStore.getState().debugApplied).toBe(false)
  })

  it('refuses a mode that is not A or B and keeps the session on its mode', () => {
    expect(createDebugApi().ui.setMaterialPopMode('C')).toMatchObject({ ok: false })
    expect(useGameStore.getState().materialPopMode).toBe('A')
    expect(sink.events).toEqual([])
  })
})
