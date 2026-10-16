import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { checkpointWrites, installSaveFolder } from '../store/checkpoint'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { createMemorySaveFolder } from '../store/memorySaveFolder'
import { stateDigest } from '../systems/authority/stateDigest'
import { SAVE_FORMAT_VERSION } from '../systems/save/saveSlot'
import { createDebugSaves } from './debugSaves'

const WALL_CLOCK_MS = 1_760_000_000_000

let sink: ReturnType<typeof createMemorySink>
let disk: ReturnType<typeof createMemorySaveFolder>

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  disk = createMemorySaveFolder()
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => WALL_CLOCK_MS })
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

  it('reads the exact text Export would hand over, and refuses before any save', async () => {
    expect(createDebugSaves().exportText()).toEqual({
      ok: false,
      problems: ['nothing is saved yet'],
    })
    game().dock('sell')
    await checkpointWrites()
    expect(createDebugSaves().exportText()).toEqual({
      ok: true,
      fileName: 'steampunk-miner-autosave.json',
      json: disk.items.get('saves/autosave.json'),
    })
  })

  it('imports a text as a picked file, logged as a debug command, at the saved digest', async () => {
    game().dock('sell')
    await checkpointWrites()
    const saved = createDebugSaves().exportText()
    if (!saved.ok) throw new Error(saved.problems.join('; '))
    const digest = stateDigest(readAuthorityState())
    resetGameStore()
    expect(createDebugSaves().importText(saved.json)).toEqual({ ok: true })
    expect(stateDigest(readAuthorityState())).toBe(digest)
    const commands = sink.events.filter((line) => line.event === 'debug_command_applied')
    expect(commands.map((line) => (line.data as { command: string }).command)).toEqual([
      'saves.importText',
    ])
  })

  it('answers a refused import with its problems', () => {
    expect(createDebugSaves().importText('{')).toEqual({
      ok: false,
      problems: ['save is not JSON'],
    })
  })
})
