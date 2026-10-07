import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { toCanonical } from '../systems/money'
import { saveSectionsOf } from '../systems/registries/saveSections'
import PRE_175_SAVE from '../systems/save/fixtures/pre-175-planet-1.save.json'
import { readSaveSlot, type SaveSlotFile } from '../systems/save/saveSlot'
import { checkpointWrites, installSaveSlots, loadCheckpoint, type SaveSlots } from './checkpoint'
import { resetGameStore, useGameStore } from './gameStore'

/** The shell's save folder, kept in memory: what a quit leaves on disk for the next start. */
function memorySaveSlots() {
  const files = new Map<string, string>()
  const slots: SaveSlots = {
    write: async (slot, json) => void files.set(`slot-${slot}.json`, json),
    read: async (slot) => files.get(`slot-${slot}.json`) ?? null,
    setAside: async (slot) => {
      files.set(`slot-${slot}.refused.json`, files.get(`slot-${slot}.json`) as string)
      files.delete(`slot-${slot}.json`)
    },
  }
  return { files, slots }
}

let sink: ReturnType<typeof createMemorySink>
let disk: ReturnType<typeof memorySaveSlots>

/** A fresh process: a new store and run log over the same save folder. */
function startProcess(): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveSlots(disk.slots)
}

beforeEach(() => {
  disk = memorySaveSlots()
  startProcess()
})

afterEach(() => {
  installSaveSlots(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

const savedFile = () => JSON.parse(disk.files.get('slot-1.json') as string) as SaveSlotFile

const linesNamed = (event: string) => sink.events.filter((line) => line.event === event)

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
        slot: 'slot-1',
        epoch: 1,
        bytes: disk.files.get('slot-1.json')?.length,
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
      { slot: 'slot-1', epoch: 1, digest: savedFile().digest },
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('resumes a pre-#175 save through the chain and logs save_migrated before checkpoint_loaded', async () => {
    disk.files.set('slot-1.json', JSON.stringify(PRE_175_SAVE))
    await resumeFromDisk()
    expect(toCanonical(game().money)).toBe(PRE_175_SAVE.profile.players.player_1.wallet)
    const names = sink.events.map((line) => line.event)
    expect(names.indexOf('save_migrated')).toBeLessThan(names.indexOf('checkpoint_loaded'))
    expect(linesNamed('save_migrated').map((line) => line.data)).toEqual([
      { version: 'snapshotVersion', from: 18, to: 19 },
      { version: 'generatorVersion', from: 5, to: 6 },
      { version: 'generatorVersion', from: 6, to: 7 },
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
    disk.files.set('slot-1.json', refused)
    startProcess()
    expect(await loadCheckpoint()).toEqual({
      problems: ['save.generatorVersion is 99, this build reads 7'],
    })
    expect(disk.files.get('slot-1.refused.json')).toBe(refused)
    expect(disk.files.has('slot-1.json')).toBe(false)
  })

  it('has nothing to resume from an empty slot', async () => {
    expect(await loadCheckpoint()).toBeNull()
  })
})
