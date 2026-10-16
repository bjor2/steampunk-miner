import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { runEventProblems } from '../logging/runEventSchema'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { stateDigest } from '../systems/authority/stateDigest'
import type { SaveSlotFile } from '../systems/save/saveSlot'
import { readAuthorityState } from './authorityLink'
import { checkpointWrites, installSaveFolder } from './checkpoint'
import { resetGameStore, useGameStore } from './gameStore'
import { createMemorySaveFolder } from './memorySaveFolder'
import { installSaveTransfer, type SaveTransfer } from './saveKeepingSlice'
import type { SaveFolder } from './saveFolder'

/** A folder whose writes throw like a full localStorage while `isFull` is set. */
interface FillableDisk {
  items: Map<string, string>
  folder: SaveFolder
  isFull: boolean
}

let sink: ReturnType<typeof createMemorySink>
let disk: FillableDisk
let handedOver: { fileName: string; json: string }[]
let pickedText: string | null
let keepAsks: number

function fillableDisk(): FillableDisk {
  const memory = createMemorySaveFolder()
  const disk: FillableDisk = { items: memory.items, folder: { ...memory.folder }, isFull: false }
  disk.folder.write = async (slot, json, entryJson) => {
    if (disk.isFull) throw new DOMException('full', 'QuotaExceededError')
    return memory.folder.write(slot, json, entryJson)
  }
  return disk
}

const fakeTransfer: SaveTransfer = {
  handOverSaveFile: async (fileName, json) => void handedOver.push({ fileName, json }),
  pickSaveFile: async () => pickedText,
}

/** A fresh process: a new store and run log over the same disk. */
function startProcess(): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({
    folder: disk.folder,
    readWallClockMs: () => 1_760_000_000_000,
    askToKeepSaves: () => void (keepAsks += 1),
  })
  installSaveTransfer(fakeTransfer)
}

/** Another device: an empty disk. */
function startOnAnotherDevice(): void {
  disk = fillableDisk()
  startProcess()
}

beforeEach(() => {
  handedOver = []
  pickedText = null
  keepAsks = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  startOnAnotherDevice()
})

afterEach(() => {
  installSaveFolder(null)
  installSaveTransfer(null)
  uninstallRunLog()
  vi.restoreAllMocks()
})

const game = () => useGameStore.getState()
const sessionDigest = () => stateDigest(readAuthorityState())
const autosaveText = () => disk.items.get('saves/autosave.json')
const linesNamed = (event: string) => sink.events.filter((line) => line.event === event)
const dataOf = (event: string) => linesNamed(event).map((line) => line.data)

/** Docks at the sell bay, a checkpoint moment, and waits for its write to end. */
async function dockAndWrite(): Promise<void> {
  game().dock('sell')
  await checkpointWrites()
}

describe('save keeping', () => {
  it('logs checkpoint_failed and shows the progress unsaved when no store takes the write', async () => {
    disk.isFull = true
    await dockAndWrite()
    expect(game().unsavedProgress).toEqual({ slot: 'autosave', saveEpoch: 1, cause: 'quota' })
    expect(dataOf('checkpoint_failed')).toEqual([
      expect.objectContaining({ slot: 'autosave', epoch: 1, cause: 'quota' }),
    ])
    expect(dataOf('checkpoint_saved')).toEqual([])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('leaves the session as it was: the lost save carries the digest it still has', async () => {
    disk.isFull = true
    await dockAndWrite()
    const [failed] = dataOf('checkpoint_failed') as { digest: string }[]
    expect(failed.digest).toBe(sessionDigest())
  })

  it('clears the unsaved progress once the next write lands, at the session digest', async () => {
    disk.isFull = true
    await dockAndWrite()
    disk.isFull = false
    game().undock()
    await dockAndWrite()
    expect(game().unsavedProgress).toBeNull()
    const saved = JSON.parse(autosaveText() as string) as SaveSlotFile
    expect(saved.saveEpoch).toBe(2)
    expect(saved.digest).toBe(sessionDigest())
  })

  it('asks the browser to keep the saves once, at the first save', async () => {
    await dockAndWrite()
    game().undock()
    await dockAndWrite()
    expect(keepAsks).toBe(1)
  })

  it('exports the exact text of the last save written', async () => {
    await dockAndWrite()
    game().exportSave()
    expect(handedOver).toEqual([
      { fileName: 'steampunk-miner-autosave.json', json: autosaveText() },
    ])
    expect(dataOf('save_exported')).toEqual([
      { slot: 'autosave', epoch: 1, bytes: autosaveText()?.length },
    ])
    expect(game().saveTransferProblems).toEqual([])
  })

  it('exports the save no store took, so the unsaved progress can still leave the device', async () => {
    disk.isFull = true
    await dockAndWrite()
    game().exportSave()
    const exported = JSON.parse(handedOver[0].json) as SaveSlotFile
    expect(exported.digest).toBe(sessionDigest())
    expect(autosaveText()).toBeUndefined()
  })

  it('refuses an export before anything is saved', () => {
    game().exportSave()
    expect(handedOver).toEqual([])
    expect(game().saveTransferProblems).toEqual([
      'nothing is saved yet: the game saves at the dock',
    ])
  })

  it('imports an exported save on another device at the same digest and the same bytes', async () => {
    game().giveMoney('12345')
    await dockAndWrite()
    const digest = sessionDigest()
    game().exportSave()
    const exported = handedOver[0].json

    startOnAnotherDevice()
    pickedText = exported
    await game().importSave()
    await checkpointWrites()
    expect(sessionDigest()).toBe(digest)
    expect(autosaveText()).toBe(exported)
    game().exportSave()
    expect(handedOver.at(-1)?.json).toBe(exported)
  })

  it('logs save_imported before checkpoint_loaded, then the autosave write', async () => {
    await dockAndWrite()
    game().exportSave()
    startOnAnotherDevice()
    game().importSaveFromText(handedOver[0].json)
    await checkpointWrites()
    const names = sink.events.map((line) => line.event)
    expect(names.indexOf('save_imported')).toBeLessThan(names.indexOf('checkpoint_loaded'))
    expect(dataOf('checkpoint_saved')).toEqual([expect.objectContaining({ slot: 'autosave' })])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('refuses a file this build cannot read and changes nothing', async () => {
    const digest = sessionDigest()
    expect(game().importSaveFromText('{"formatVersion":99}')).not.toEqual([])
    expect(game().importSaveFromText('not a save')).toEqual(['save is not JSON'])
    await checkpointWrites()
    expect(sessionDigest()).toBe(digest)
    expect(autosaveText()).toBeUndefined()
    expect(game().saveTransferProblems).toEqual(['save is not JSON'])
  })

  it('does nothing when the player picks no file', async () => {
    await game().importSave()
    expect(game().saveTransferProblems).toEqual([])
    expect(linesNamed('save_imported')).toEqual([])
  })

  it('writes the autosave as the page hides while docked', async () => {
    await dockAndWrite()
    game().writeCheckpointOnPageHide()
    await checkpointWrites()
    expect(dataOf('checkpoint_saved').map((line) => (line as { epoch: number }).epoch)).toEqual([
      1, 2,
    ])
  })

  it('writes nothing as the page hides out on a trip, so a trip resumes at the dock', async () => {
    await dockAndWrite()
    game().undock()
    game().writeCheckpointOnPageHide()
    await checkpointWrites()
    expect(linesNamed('checkpoint_saved')).toHaveLength(1)
  })

  it('writes nothing as the page hides behind the title menu', async () => {
    await game().openTitleMenu()
    game().writeCheckpointOnPageHide()
    await checkpointWrites()
    expect(autosaveText()).toBeUndefined()
  })
})
