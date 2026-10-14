import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { installSaveFolder } from '../store/checkpoint'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { createMemorySaveFolder } from '../store/memorySaveFolder'
import { SAVE_FORMAT_VERSION } from '../systems/save/saveSlot'
import { createDebugSaves } from './debugSaves'

const WALL_CLOCK_MS = 1_760_000_000_000

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  installSaveFolder({
    folder: createMemorySaveFolder().folder,
    readWallClockMs: () => WALL_CLOCK_MS,
  })
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

describe('debug saves', () => {
  it('lists the slot a pause-menu save wrote with its whole entry', async () => {
    game().fastForward(120)
    game().openPauseMenu()
    await game().openSaveSlots()
    game().setPauseSaveName('Probe')
    await game().saveToSlot('slot-2')
    expect(await createDebugSaves().list()).toEqual({
      ok: true,
      entries: [
        {
          slot: 'slot-2',
          name: 'Probe',
          planetIndex: 1,
          playtimeTicks: readAuthorityState().tick,
          savedAtMs: WALL_CLOCK_MS,
          formatVersion: SAVE_FORMAT_VERSION,
        },
      ],
    })
  })

  it('lists nothing before any save', async () => {
    expect(await createDebugSaves().list()).toEqual({ ok: true, entries: [] })
  })
})
