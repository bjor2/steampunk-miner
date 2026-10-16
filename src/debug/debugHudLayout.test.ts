import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { cameraPresence } from '../scene/cameraPresence'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { stageHudForDebug } from '../store/hudStaging'
import { readHudModel, readPlaqueModel } from '../store/screenReads'
import { NO_HUD_STAGING } from '../systems/views/hudStaging'
import { createDebugApi } from './debugApi'

// #500's layout specs drive the compact HUD through these reads and stagings: presentation only,
// so neither the session, its digest nor the run log ever sees them.

let sink: MemorySink
const game = () => useGameStore.getState()

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => {
  stageHudForDebug(NO_HUD_STAGING)
  uninstallRunLog()
})

describe('debug api: compact HUD layout (#500)', () => {
  it('draws no staging in a run the debug API never staged', () => {
    expect(readHudModel().cargo.isFull).toBe(false)
    expect(readHudModel().threats).toEqual([])
  })

  it('stages a full hold and a threat marker on the HUD only, never the session or the log', () => {
    const before = takeSessionSnapshot().digest
    const lines = sink.events.length
    const result = createDebugApi().ui.stageHud({ isCargoFull: true, threatOctant: 2 })
    expect(result).toEqual({ ok: true })
    expect(readHudModel().cargo.isFull).toBe(true)
    expect(readHudModel().threats.map((threat) => threat.octant)).toEqual([2])
    expect(readHudModel().statuses.secondary.map((status) => status.id)).toContain('cargo_full')
    expect(takeSessionSnapshot().digest).toBe(before)
    expect(sink.events.length).toBe(lines)
  })

  it('refuses a staging whole, with every problem, and keeps the HUD as it was', () => {
    const result = createDebugApi().ui.stageHud({ isCargoFull: 'yes', threatOctant: 9 })
    expect(result).toEqual({
      ok: false,
      problems: [
        'isCargoFull must be true or false',
        'threatOctant must be null or a whole 0 to 7',
      ],
    })
    expect(readHudModel().cargo.isFull).toBe(false)
  })

  it('puts a hint of the table up next and refuses an id the table lacks', () => {
    const debug = createDebugApi()
    game().startPlaques()
    expect(debug.ui.showHint('hint_cargo')).toEqual({ ok: true })
    expect(readPlaqueModel().hint?.id).toBe('hint_cargo')
    expect(debug.ui.showHint('hint_nothing').ok).toBe(false)
  })

  it('reads where the last frame drew the vehicle, its body 0.9 m across', () => {
    Object.assign(cameraPresence, {
      widthPixels: 390,
      heightPixels: 844,
      viewShortAxisMetres: 12,
      vehicleFromCentreX: 0,
      vehicleFromCentreY: 0,
      turnRadians: 0,
    })
    const result = createDebugApi().ui.getVehicleScreenBox()
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect((result.box.left + result.box.right) / 2).toBeCloseTo(195, 6)
    expect((result.box.top + result.box.bottom) / 2).toBeCloseTo(422, 6)
    expect(result.box.right - result.box.left).toBeCloseTo(0.9 * (390 / 12), 6)
  })
})
