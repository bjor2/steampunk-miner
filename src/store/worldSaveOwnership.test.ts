import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { toCanonical } from '../systems/money'
import { stateDigest } from '../systems/authority/stateDigest'
import {
  playerProfileOf,
  playerProfileText,
  readPlayerProfile,
} from '../systems/save/playerProfile'
import type { SaveSlotFile } from '../systems/save/saveSlot'
import { unlocksToSave } from '../systems/save/savedUnlocks'
import { readAuthorityState } from './authorityLink'
import {
  checkpointWrites,
  installSaveFolder,
  joinHostWorld,
  listSaveSlots,
  loadSaveSlot,
  saveToManualSlot,
} from './checkpoint'
import { readLocalVehicle, resetGameStore, runEventPlaceOf, useGameStore } from './gameStore'
import { setVehicleLoadout } from './loadoutActions'
import { createMemorySaveFolder } from './memorySaveFolder'

let sink: ReturnType<typeof createMemorySink>
let disk: ReturnType<typeof createMemorySaveFolder>

const game = () => useGameStore.getState()

/** A fresh process on its own machine: a new store and run log over a new save folder. */
function startMachine(): void {
  resetGameStore()
  disk = createMemorySaveFolder()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => 1_760_000_000_000 })
}

/** The host's machine: a planet 1 world it saves at the dock, sent as the host sends it. */
async function hostSaveText(): Promise<string> {
  startMachine()
  game().giveMoney('1234')
  game().dock('sell')
  await checkpointWrites()
  return disk.items.get('saves/autosave.json') as string
}

/** The guest's own world, far ahead of the host's: planet 8, rich, owning an item, saved. */
async function startGuestOwnWorld(): Promise<void> {
  startMachine()
  game().setPlanet(8)
  game().giveMoney('1e30')
  setVehicleLoadout(game().playerId, {}, ['slot.powerup_5'])
  game().dock('sell')
  await checkpointWrites()
}

function joinAndResume(hostText: string): void {
  const joined = joinHostWorld(hostText)
  if (!('state' in joined)) throw new Error(`host save refused: ${joined.problems.join('; ')}`)
  game().resumeCheckpoint(joined)
}

const savedLines = () => sink.events.filter((line) => line.event === 'checkpoint_saved')

let hostText: string
let hostFile: SaveSlotFile

beforeEach(async () => {
  hostText = await hostSaveText()
  hostFile = JSON.parse(hostText) as SaveSlotFile
  await startGuestOwnWorld()
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

describe('world save ownership (ticket 407)', () => {
  it('resumes the host save when joining: its planet, money, unlocks and digest', () => {
    joinAndResume(hostText)
    expect(game().planetTier).toBe(1)
    expect(toCanonical(game().money)).toBe(hostFile.profile.players.player_1.wallet)
    expect(unlocksToSave(readAuthorityState())).toEqual(hostFile.unlocked)
    expect(stateDigest(readAuthorityState())).toBe(hostFile.digest)
  })

  it('logs the joined world as checkpoint_loaded from the host save, every line registered', () => {
    joinAndResume(hostText)
    const loaded = sink.events.filter((line) => line.event === 'checkpoint_loaded')
    expect(loaded.map((line) => line.data)).toEqual([
      { slot: 'host', epoch: hostFile.saveEpoch, digest: hostFile.digest },
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('writes no world save at a guest dock, so the guest autosave keeps their own world', async () => {
    const ownWorld = disk.items.get('saves/autosave.json')
    const savedBefore = savedLines().length
    joinAndResume(hostText)
    game().undock()
    game().dock('sell')
    await checkpointWrites()
    expect(disk.items.get('saves/autosave.json')).toBe(ownWorld)
    expect(savedLines()).toHaveLength(savedBefore)
  })

  it('refuses a guest manual save and writes no slot', async () => {
    joinAndResume(hostText)
    expect(saveToManualSlot('slot-2', 'Theirs', runEventPlaceOf(game()))).toEqual([
      'a guest never writes a world save: the host owns the world it joined',
    ])
    expect((await listSaveSlots()).map(({ slot }) => slot)).toEqual(['autosave'])
  })

  it('imports no unlocks, items or money when a profile is loaded into another world', () => {
    expect(readLocalVehicle().loadout.owned).toEqual(['slot.powerup_5'])
    expect(unlocksToSave(readAuthorityState()).length).toBeGreaterThan(hostFile.unlocked.length)
    game().setPreference('shake', false)
    const profileText = playerProfileText(playerProfileOf(game().prefs))
    joinAndResume(hostText)
    const digestJoined = stateDigest(readAuthorityState())
    const { profile, problems } = readPlayerProfile(profileText)
    game().adoptPreferences({ prefs: profile.settings, problems, bindingsReset: [] })
    expect(problems).toEqual([])
    expect(game().prefs.shake).toBe(false)
    expect(stateDigest(readAuthorityState())).toBe(digestJoined)
    expect(unlocksToSave(readAuthorityState())).toEqual(hostFile.unlocked)
    expect(readLocalVehicle().loadout.owned).toEqual([])
    expect(toCanonical(game().money)).toBe(hostFile.profile.players.player_1.wallet)
  })

  it('leaves a player whose host save is refused the host of their own world', async () => {
    expect(joinHostWorld('{"formatVersion":2}')).toHaveProperty('problems')
    game().undock()
    game().dock('sell')
    await checkpointWrites()
    expect(savedLines().map((line) => (line.data as { epoch: number }).epoch)).toEqual([1, 2])
  })

  it('makes a guest the host again once they load a slot of their own', async () => {
    joinAndResume(hostText)
    const ownSave = await loadSaveSlot('autosave')
    if (ownSave === null || !('state' in ownSave)) throw new Error('no own world to load')
    game().resumeCheckpoint(ownSave)
    expect(game().planetTier).toBe(8)
    expect(saveToManualSlot('slot-2', 'Mine again', runEventPlaceOf(game()))).toEqual([])
    expect((await listSaveSlots()).map(({ slot }) => slot)).toEqual(['autosave', 'slot-2'])
  })
})
