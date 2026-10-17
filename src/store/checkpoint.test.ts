import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { toCanonical } from '../systems/money'
import { saveSectionsOf } from '../systems/registries/saveSections'
import PRE_175_SAVE from '../systems/save/fixtures/pre-175-planet-1.save.json'
import { loadedSaveDigestOf } from '../systems/save/loadedSaveDigest'
import { readSaveSlot, type SaveSlotFile } from '../systems/save/saveSlot'
import { SAVE_FORMAT_VERSION } from '../systems/save/saveSlot'
import {
  checkpointWrites,
  deleteSaveSlot,
  installSaveFolder,
  latestSaveSlot,
  listSaveSlots,
  loadCheckpoint,
  loadSaveSlot,
  saveToManualSlot,
} from './checkpoint'
import { resetGameStore, runEventPlaceOf, useGameStore } from './gameStore'
import { createMemorySaveFolder } from './memorySaveFolder'

let sink: ReturnType<typeof createMemorySink>
let disk: ReturnType<typeof createMemorySaveFolder>
let wallClockMs: number

/** A fresh process: a new store and run log over the same save folder. */
function startProcess(): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => wallClockMs })
}

beforeEach(() => {
  disk = createMemorySaveFolder()
  wallClockMs = 1_760_000_000_000
  startProcess()
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

const savedFile = () => JSON.parse(disk.items.get('saves/autosave.json') as string) as SaveSlotFile

const linesNamed = (event: string) => sink.events.filter((line) => line.event === event)

/** The `slot` of each `checkpoint_saved` or `checkpoint_loaded` line. */
const slotsLogged = (event: 'checkpoint_saved' | 'checkpoint_loaded') =>
  linesNamed(event).map((line) => (line.data as { slot: string }).slot)

/** The fixture predates every slice section, so each registered one is named as restored (#224). */
function restoredSectionLines() {
  const ids = [...saveSectionsOf('session'), ...saveSectionsOf('player')].map(({ id }) => id)
  if (ids.length === 0) return []
  return [{ restoredSections: [...new Set(ids)].sort().map((section) => ({ section })) }]
}

async function resumeFromDisk(): Promise<void> {
  const checkpoint = await loadCheckpoint()
  if (checkpoint === null || !('state' in checkpoint)) throw new Error('no checkpoint to resume')
  game().resumeCheckpoint(checkpoint)
}

/** Quits after the last checkpoint landed, starts again and resumes. */
async function quitAndResume(): Promise<void> {
  await checkpointWrites()
  startProcess()
  await resumeFromDisk()
}

describe('checkpoint', () => {
  it('writes the save when the vehicle docks and logs checkpoint_saved', async () => {
    game().dock('sell')
    await checkpointWrites()
    const file = savedFile()
    expect(readSaveSlot(file).problems).toEqual([])
    expect(linesNamed('checkpoint_saved').map((line) => line.data)).toEqual([
      {
        slot: 'autosave',
        epoch: 1,
        bytes: disk.items.get('saves/autosave.json')?.length,
        digest: file.digest,
      },
    ])
  })

  it('writes again after each purchase at the dock, never out on a trip', async () => {
    game().giveMoney('1e6')
    game().teleportToDock('upgrade')
    game().buyUpgrade('hull')
    game().undock()
    await checkpointWrites()
    expect(savedFile().saveEpoch).toBe(2)
    expect(savedFile().profile.players.player_1.vehicle.mode).toBe('docked')
  })

  it('restores money, upgrades and core bay after a quit and resume at the dock', async () => {
    game().giveMoney('1e6')
    game().setCoreFragments(5)
    game().teleportToDock('upgrade')
    game().buyUpgrade('drill_power')
    const before = game()
    await quitAndResume()
    expect(toCanonical(game().money)).toBe(toCanonical(before.money))
    expect(game().vehicle).toEqual(before.vehicle)
    expect(game().vehicle.mode).toBe('docked')
    expect(game().platform.coreBay).toBe(5)
    expect(game().planetTier).toBe(1)
  })

  it('writes on travel and resumes on the planet it travelled to', async () => {
    game().giveMoney('1e9')
    game().setCoreFragments(400)
    game().dock('sell')
    game().travel()
    await quitAndResume()
    expect(game().planetTier).toBe(2)
    expect(game().vehicle.mode).toBe('docked')
  })

  it('continues the epoch and the command seqs after a resume', async () => {
    game().dock('sell')
    await quitAndResume()
    game().undock()
    game().dock('sell')
    await checkpointWrites()
    expect(linesNamed('command_rejected')).toEqual([])
    expect(savedFile().saveEpoch).toBe(2)
  })

  it('logs checkpoint_loaded with the slot, epoch and digest, and every line is registered', async () => {
    game().dock('sell')
    await quitAndResume()
    expect(linesNamed('checkpoint_loaded').map((line) => line.data)).toEqual([
      { slot: 'autosave', epoch: 1, digest: savedFile().digest },
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('resumes a pre-#175 save through the chain and logs save_migrated before checkpoint_loaded', async () => {
    disk.items.set('saves/slot-1.json', JSON.stringify(PRE_175_SAVE))
    startProcess()
    await resumeFromDisk()
    expect(toCanonical(game().money)).toBe(PRE_175_SAVE.profile.players.player_1.wallet)
    const names = sink.events.map((line) => line.event)
    expect(names.indexOf('save_migrated')).toBeLessThan(names.indexOf('checkpoint_loaded'))
    expect(linesNamed('save_migrated').map((line) => line.data)).toEqual([
      { version: 'snapshotVersion', from: 18, to: 19 },
      { version: 'snapshotVersion', from: 19, to: 20 },
      { version: 'snapshotVersion', from: 20, to: 21 },
      { version: 'generatorVersion', from: 5, to: 6 },
      { version: 'generatorVersion', from: 6, to: 7 },
      { version: 'generatorVersion', from: 7, to: 8 },
      { version: 'generatorVersion', from: 8, to: 9 },
      { version: 'generatorVersion', from: 9, to: 10 },
      { version: 'formatVersion', from: 1, to: 2 },
      { version: 'formatVersion', from: 2, to: 3 },
      ...restoredSectionLines(),
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('logs no save_migrated for a save of this build', async () => {
    game().dock('sell')
    await quitAndResume()
    expect(linesNamed('save_migrated')).toEqual([])
  })

  it('logs nothing as debug when resuming', async () => {
    game().dock('sell')
    await quitAndResume()
    expect(linesNamed('debug_command_applied')).toEqual([])
    expect(game().debugApplied).toBe(false)
  })

  it('sets a refused save aside, never overwriting it, and starts fresh', async () => {
    game().dock('sell')
    await checkpointWrites()
    const refused = JSON.stringify({ ...savedFile(), generatorVersion: 99 })
    disk.items.set('saves/autosave.json', refused)
    startProcess()
    expect(await loadCheckpoint()).toEqual({
      problems: ['save.generatorVersion is 99, this build reads 10'],
    })
    expect(disk.items.get('saves/autosave.refused.json')).toBe(refused)
    expect(disk.items.has('saves/autosave.json')).toBe(false)
    expect(disk.items.has('saves/autosave.entry.json')).toBe(false)
  })

  it('has nothing to resume from an empty slot', async () => {
    expect(await loadCheckpoint()).toBeNull()
  })
})

const saveHere = (slot: `slot-${number}`, name: string) =>
  saveToManualSlot(slot, name, runEventPlaceOf(game()))

describe('save slots (#401)', () => {
  it('writes the checkpoint into the autosave slot, with its entry beside it', async () => {
    game().dock('sell')
    expect(await listSaveSlots()).toEqual([
      {
        slot: 'autosave',
        name: 'Autosave',
        planetIndex: 1,
        playtimeTicks: savedFile().tick,
        savedAtMs: wallClockMs,
        formatVersion: SAVE_FORMAT_VERSION,
      },
    ])
    expect(savedFile().slot).toEqual({ name: 'Autosave', savedAtMs: wallClockMs })
  })

  it('writes a named manual slot beside the autosave and lists the autosave first', async () => {
    game().dock('sell')
    expect(saveHere('slot-4', 'Before the core')).toEqual([])
    const listed = await listSaveSlots()
    expect(listed.map(({ slot, name }) => [slot, name])).toEqual([
      ['autosave', 'Autosave'],
      ['slot-4', 'Before the core'],
    ])
    expect(slotsLogged('checkpoint_saved')).toEqual(['autosave', 'slot-4'])
  })

  it('refuses a manual save into the autosave slot or past the ninth slot, writing nothing', async () => {
    expect(saveToManualSlot('autosave', 'Mine', runEventPlaceOf(game()))).toEqual([
      'autosave is not a manual slot',
    ])
    expect(saveHere('slot-10', 'Tenth')).toEqual(['slot-10 is not a manual slot'])
    expect(await listSaveSlots()).toEqual([])
  })

  it('replaces the save in a manual slot written again', async () => {
    saveHere('slot-1', 'First')
    saveHere('slot-1', 'Second')
    const listed = await listSaveSlots()
    expect(listed.map(({ slot, name }) => [slot, name])).toEqual([['slot-1', 'Second']])
  })

  it('continues from the slot written last', async () => {
    game().dock('sell')
    await checkpointWrites()
    wallClockMs += 60_000
    saveHere('slot-2', 'Later')
    expect((await latestSaveSlot())?.slot).toBe('slot-2')
    wallClockMs += 60_000
    game().undock()
    game().dock('sell')
    expect((await latestSaveSlot())?.slot).toBe('autosave')
  })

  it('loads a manual slot and logs checkpoint_loaded with its slot', async () => {
    game().giveMoney('1e6')
    saveHere('slot-3', 'Rich')
    await checkpointWrites()
    const money = toCanonical(game().money)
    startProcess()
    const checkpoint = await loadSaveSlot('slot-3')
    if (checkpoint === null || !('state' in checkpoint)) throw new Error('no save in slot-3')
    game().resumeCheckpoint(checkpoint)
    expect(toCanonical(game().money)).toBe(money)
    expect(slotsLogged('checkpoint_loaded')).toEqual(['slot-3'])
  })

  it('empties a deleted slot, its entry too', async () => {
    saveHere('slot-5', 'Gone')
    await deleteSaveSlot('slot-5')
    expect(await listSaveSlots()).toEqual([])
    expect([...disk.items.keys()]).toEqual([])
  })

  it('reads a lost entry off its save again', async () => {
    saveHere('slot-6', 'Crashed')
    await checkpointWrites()
    disk.items.delete('saves/slot-6.entry.json')
    expect((await listSaveSlots()).map(({ slot, name }) => [slot, name])).toEqual([
      ['slot-6', 'Crashed'],
    ])
  })

  it('resumes the device fixture to the digest its golden holds every browser engine to', async () => {
    disk.items.set('saves/autosave.json', JSON.stringify(PRE_175_SAVE))
    startProcess()
    await resumeFromDisk()
    expect(linesNamed('checkpoint_loaded').map((line) => line.data)).toEqual([
      { slot: 'autosave', epoch: PRE_175_SAVE.saveEpoch, ...loadedSaveDigestOf(PRE_175_SAVE) },
    ])
  })

  it('moves a v1 checkpoint from slot-1 into the empty autosave slot, its text unchanged', async () => {
    const v1Text = JSON.stringify(PRE_175_SAVE)
    disk.items.set('saves/slot-1.json', v1Text)
    startProcess()
    expect(await listSaveSlots()).toEqual([
      {
        slot: 'autosave',
        name: 'Autosave',
        planetIndex: PRE_175_SAVE.world.planetIndex,
        playtimeTicks: PRE_175_SAVE.tick,
        savedAtMs: null,
        formatVersion: 1,
      },
    ])
    expect(disk.items.get('saves/autosave.json')).toBe(v1Text)
    expect(disk.items.has('saves/slot-1.json')).toBe(false)
  })

  it('leaves a manual save of this format in slot-1 where it is', async () => {
    saveHere('slot-1', 'Mine')
    await checkpointWrites()
    startProcess()
    const listed = await listSaveSlots()
    expect(listed.map(({ slot, name }) => [slot, name])).toEqual([['slot-1', 'Mine']])
  })
})
