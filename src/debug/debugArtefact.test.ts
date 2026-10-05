import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { validateScenario } from '../systems/scenario'
import { createDebugApi } from './debugApi'

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const scenarioHolding = (artefactId: string, planet = 1) => ({
  scenarioVersion: 1,
  name: 'holding-an-artefact',
  worldSeed: 83921,
  start: { planet, artefactId },
})

describe('debug api: artefacts (#46)', () => {
  it('reads no artefact and a live cache on a fresh run', () => {
    expect(createDebugApi().artefact()).toEqual({
      ok: true,
      artefactId: null,
      breathingRoomCharges: 0,
      cacheState: 'available',
    })
  })

  it('sets the held artefact as a logged debug command', () => {
    const debug = createDebugApi()
    expect(debug.setArtefact('artefact.breathing_room')).toEqual({ ok: true })
    expect(debug.artefact()).toEqual({
      ok: true,
      artefactId: 'artefact.breathing_room',
      breathingRoomCharges: 1,
      cacheState: 'chosen',
    })
    expect(sink.events.map((event) => event.event)).toContain('debug_command_applied')
  })

  it('refuses an id that is not one of the three options and changes nothing', () => {
    const debug = createDebugApi()
    expect(debug.setArtefact('artefact.drill_bump')).toEqual({
      ok: false,
      problems: ['"artefact.drill_bump" is not an artefact option'],
    })
    expect(debug.artefact()).toMatchObject({ artefactId: null })
  })

  it('starts a scenario holding an artefact, and planet 2 then reads the cache as inert', () => {
    const debug = createDebugApi()
    expect(debug.applyScenario(scenarioHolding('artefact.assay_beacon'))).toMatchObject({
      ok: true,
    })
    expect(debug.artefact()).toMatchObject({
      artefactId: 'artefact.assay_beacon',
      cacheState: 'chosen',
    })
    debug.setPlanet(2)
    expect(debug.artefact()).toMatchObject({ cacheState: 'inert' })
  })

  it('refuses a scenario whose artefact id is not registered', () => {
    expect(validateScenario(scenarioHolding('powerup.haste'))).toEqual([
      'scenario.start.artefactId "powerup.haste" is not a registered artefact id (artefact.ore_whisper, artefact.breathing_room, artefact.assay_beacon)',
    ])
  })
})
