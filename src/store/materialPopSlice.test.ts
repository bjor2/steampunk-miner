import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'

// Ticket 614 (#442): the material pop A/B switch, per session, logged, never in the world.

let sink: MemorySink

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  resetGameStore()
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()
const popLines = () =>
  sink.events.filter((event) => event.event === 'material_pop_mode_set').map((event) => event.data)

describe('material pop slice', () => {
  it('starts a session on A when the URL asks no mode, and logs it as the default', () => {
    game().startMaterialPopMode(null)
    expect(game().materialPopMode).toBe('A')
    expect(popLines()).toEqual([{ mode: 'A', source: 'default' }])
  })

  it('starts a session on the mode the URL asks', () => {
    game().startMaterialPopMode('B')
    expect(game().materialPopMode).toBe('B')
    expect(popLines()).toEqual([{ mode: 'B', source: 'url' }])
  })

  it('switches live from the panel and logs every switch', () => {
    game().startMaterialPopMode(null)
    game().switchMaterialPopMode('B', 'panel')
    game().switchMaterialPopMode('A', 'panel')
    expect(game().materialPopMode).toBe('A')
    expect(popLines()).toEqual([
      { mode: 'A', source: 'default' },
      { mode: 'B', source: 'panel' },
      { mode: 'A', source: 'panel' },
    ])
  })

  it('never changes the session, its digest or its debug mark', () => {
    const before = takeSessionSnapshot()
    game().startMaterialPopMode('B')
    game().switchMaterialPopMode('A', 'panel')
    expect(takeSessionSnapshot()).toEqual(before)
    expect(game().debugApplied).toBe(false)
  })
})
