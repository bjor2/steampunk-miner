import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import PRE_175_SAVE from '../systems/save/fixtures/pre-175-planet-1.save.json'
import { checkpointWrites, installSaveFolder, loadCheckpoint } from './checkpoint'
import { resetGameStore, useGameStore } from './gameStore'
import { createMemorySaveFolder } from './memorySaveFolder'
import { installPreferencesStorage, loadPreferences, preferencesWrites } from './preferencesFile'

let disk: ReturnType<typeof createMemorySaveFolder>
let preferencesFile: string | null

/** A fresh process on this profile: a new store over the same save folder and preferences file. */
async function startProcess(): Promise<void> {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => 1_760_000_000_000 })
  game().adoptPreferences(await loadPreferences())
}

async function resumeFromDisk(): Promise<void> {
  const checkpoint = await loadCheckpoint()
  if (checkpoint === null || !('state' in checkpoint)) throw new Error('no checkpoint to resume')
  game().resumeCheckpoint(checkpoint)
}

/** A v1 single-slot save, as a build before the slot layout (#401) left it. */
function putV1SaveOnDisk(): void {
  disk.items.set('saves/slot-1.json', JSON.stringify(PRE_175_SAVE))
}

beforeEach(async () => {
  disk = createMemorySaveFolder()
  preferencesFile = null
  installPreferencesStorage({
    read: async () => preferencesFile,
    write: async (json) => {
      preferencesFile = json
    },
  })
  await startProcess()
})

afterEach(() => {
  installSaveFolder(null)
  installPreferencesStorage(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

describe('ledger toast', () => {
  it('shows once a v1 save is migrated and keeps the seen-flag in the preferences file', async () => {
    putV1SaveOnDisk()
    await startProcess()
    await resumeFromDisk()
    await preferencesWrites()
    expect(game().isLedgerToastShown).toBe(true)
    expect(JSON.parse(preferencesFile as string)).toMatchObject({ hasSeenLedgerToast: true })
  })

  it('goes once dismissed, and the seen-flag stays', async () => {
    putV1SaveOnDisk()
    await startProcess()
    await resumeFromDisk()
    game().dismissLedgerToast()
    expect(game().isLedgerToastShown).toBe(false)
    expect(game().prefs.hasSeenLedgerToast).toBe(true)
  })

  it('never shows again on the same profile, even for another v1 save', async () => {
    putV1SaveOnDisk()
    await startProcess()
    await resumeFromDisk()
    await preferencesWrites()
    putV1SaveOnDisk()
    disk.items.delete('saves/autosave.json')
    await startProcess()
    await resumeFromDisk()
    expect(game().isLedgerToastShown).toBe(false)
  })

  it('never shows for a save of this build', async () => {
    game().dock('sell')
    await checkpointWrites()
    await startProcess()
    await resumeFromDisk()
    expect(game().isLedgerToastShown).toBe(false)
    expect(game().prefs.hasSeenLedgerToast).toBe(false)
  })

  it('never shows on a new game', () => {
    game().startNewGame()
    expect(game().isLedgerToastShown).toBe(false)
  })
})
