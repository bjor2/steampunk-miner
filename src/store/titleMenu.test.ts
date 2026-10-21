import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import {
  createAuthorityState,
  withArtefact,
  withVehicle,
  withWallet,
  type AuthorityState,
} from '../systems/authority/authorityState'
import { openFeatureIdsOf } from '../systems/authority/featureUnlocks'
import { takeSnapshot } from '../systems/authority/sessionSnapshot'
import { stateDigest } from '../systems/authority/stateDigest'
import { fromCanonical } from '../systems/money'
import { planetDisplayNameOf } from '../systems/registries/planetNames'
import { saveSlotOf } from '../systems/save/saveSlot'
import { slotEntryOf, type SaveSlotKey } from '../systems/save/saveSlotIndex'
import { TITLE_MENU_IDS, TITLE_MENU_ID_TEMPLATES } from '../systems/views/titleMenuModel'
import { readAuthorityState } from './authorityLink'
import { installSaveFolder } from './checkpoint'
import { resetGameStore, useGameStore } from './gameStore'
import { pressAction, releaseAction, resetInput } from './inputRuntime'
import { isLiveStepHeld } from './liveStepSlice'
import { createMemorySaveFolder } from './memorySaveFolder'
import { inputLayerOf } from './presentationSlice'
import { readTitleMenuModel } from './screenReads'

let sink: ReturnType<typeof createMemorySink>
let disk: ReturnType<typeof createMemorySaveFolder>

const PLAYER = 'player_1'
const WALL_CLOCK_MS = 1_760_000_000_000

beforeEach(() => {
  disk = createMemorySaveFolder()
  resetGameStore()
  resetInput()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => WALL_CLOCK_MS })
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

const model = () => {
  const shown = readTitleMenuModel()
  if (shown === null) throw new Error('the title menu is closed')
  return shown
}

const linesNamed = (event: string) => sink.events.filter((line) => line.event === event)

/** The store's run world (seed 1), as a fresh launch starts it: the P1 baseline. */
function baselineState(): AuthorityState {
  return createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: [PLAYER] })
}

/** Planet 12 with a rich wallet, a drill past the curve and the ore whisper picked on planet 1. */
function progressedState(): AuthorityState {
  const start = createAuthorityState({ planetIndex: 12, planetSeed: 1, playerIds: [PLAYER] })
  const vehicle = start.players[PLAYER].vehicle
  const levels = { ...vehicle.levels, drill_power: 123 }
  const withDrill = withVehicle(start, PLAYER, { ...vehicle, levels, mode: 'docked' })
  const held = { id: 'artefact.ore_whisper', fromPlanet: 1, breathingRoomCharges: 0 }
  const withPick = withArtefact(withDrill, PLAYER, held)
  return withWallet(withPick, PLAYER, fromCanonical('1e40'))
}

/** A save the folder holds before the launch, as an earlier session left it. */
async function plantSave(
  slot: SaveSlotKey,
  state: AuthorityState,
  name: string,
  savedAtMs: number,
): Promise<string> {
  const file = saveSlotOf(takeSnapshot(state), 1, { name, savedAtMs })
  await disk.folder.write(slot, JSON.stringify(file), JSON.stringify(slotEntryOf(slot, file)))
  return file.digest
}

function tap(action: 'ui_confirm' | 'ui_cancel' | 'ui_down'): void {
  pressAction(action)
  releaseAction(action)
}

describe('title menu (ticket 403)', () => {
  it('holds the live step and takes every key while it is open', async () => {
    await game().openTitleMenu()
    expect(inputLayerOf(game())).toBe('title')
    expect(isLiveStepHeld(game())).toBe(true)
  })

  it('disables Continue with no save and starts a new game at once from New Game', async () => {
    await game().openTitleMenu()
    expect(model().continueGame.reason).toBe('no_save')
    tap('ui_confirm')
    expect(game().titleMenu).toBeNull()
    expect(isLiveStepHeld(game())).toBe(false)
    expect(linesNamed('new_game_started')).toHaveLength(1)
    expect(linesNamed('planet_entered')).toHaveLength(1)
  })

  it('asks before a new game when a save exists, and Cancel keeps the title', async () => {
    await plantSave('autosave', progressedState(), 'Autosave', WALL_CLOCK_MS)
    await game().openTitleMenu()
    game().pressScreenButton(TITLE_MENU_IDS.newGame)
    expect(model().page).toBe('confirmNewGame')
    tap('ui_confirm')
    expect(model().page).toBe('main')
    expect(linesNamed('new_game_started')).toEqual([])
  })

  it('resets a confirmed new game to the P1 baseline: unlocks, items, artefact, firsts and planet', async () => {
    await plantSave('autosave', progressedState(), 'Autosave', WALL_CLOCK_MS)
    await game().openTitleMenu()
    await game().continueGame()
    expect(readAuthorityState().planet.index).toBe(12)
    expect(openFeatureIdsOf(readAuthorityState())).toContain('ore_whisper')

    await game().openTitleMenu()
    game().pressScreenButton(TITLE_MENU_IDS.newGame)
    game().pressScreenButton(TITLE_MENU_IDS.confirmNewGame)

    const state = readAuthorityState()
    expect(stateDigest(state)).toBe(stateDigest(baselineState()))
    expect(state.players[PLAYER].artefact).toBeNull()
    expect(openFeatureIdsOf(state)).toEqual(openFeatureIdsOf(baselineState()))
    expect(game().planetTier).toBe(1)
    expect(game().titleMenu).toBeNull()
  })

  it('keeps the saves through a new game; the autosave is replaced only at the next checkpoint', async () => {
    await plantSave('slot-3', progressedState(), 'Deep run', WALL_CLOCK_MS)
    await game().openTitleMenu()
    game().pressScreenButton(TITLE_MENU_IDS.newGame)
    game().pressScreenButton(TITLE_MENU_IDS.confirmNewGame)
    await game().openTitleMenu()
    expect(model().slotRows.map((row) => row.slot)).toEqual(['slot-3'])
  })

  it('continues the newest slot of the index and logs its load with the saved digest', async () => {
    await plantSave('autosave', baselineState(), 'Autosave', WALL_CLOCK_MS - 1000)
    const digest = await plantSave('slot-2', progressedState(), 'Deep run', WALL_CLOCK_MS)
    await game().openTitleMenu()
    expect(model().continueSummary).toBe(`Deep run · ${planetDisplayNameOf(12)} · 0:00:00`)
    tap('ui_confirm')
    await vi.waitFor(() => expect(game().titleMenu).toBeNull())
    expect(linesNamed('checkpoint_loaded').map((line) => line.data)).toEqual([
      { slot: 'slot-2', epoch: 1, digest },
    ])
    expect(stateDigest(readAuthorityState())).toBe(digest)
    expect(game().planetTier).toBe(12)
  })

  it('lists the slots on the load page and loads the one picked', async () => {
    await plantSave('autosave', progressedState(), 'Autosave', WALL_CLOCK_MS)
    const digest = await plantSave('slot-1', baselineState(), 'Start', WALL_CLOCK_MS - 1000)
    await game().openTitleMenu()
    game().pressScreenButton(TITLE_MENU_IDS.load)
    expect(model().slotRows.map(({ name, planetText }) => ({ name, planetText }))).toEqual([
      { name: 'Autosave', planetText: planetDisplayNameOf(12) },
      { name: 'Start', planetText: planetDisplayNameOf(1) },
    ])
    tap('ui_cancel')
    expect(model().page).toBe('main')
    game().pressScreenButton(TITLE_MENU_IDS.load)
    await game().loadGameFromSlot('slot-1')
    expect(stateDigest(readAuthorityState())).toBe(digest)
    expect(game().titleMenu).toBeNull()
    expect(game().pressScreenButton(TITLE_MENU_ID_TEMPLATES.slotLoad('slot-1'))).toBe(false)
  })

  it('keeps the title with the problems of a refused save, which is set aside', async () => {
    await disk.folder.write('slot-4', '{"formatVersion": 99}', '{}')
    await game().openTitleMenu()
    await game().loadGameFromSlot('slot-4')
    expect(model().problems.length).toBeGreaterThan(0)
    expect(model().slotRows).toEqual([])
    expect(game().titleMenu).not.toBeNull()
  })

  it('logs only lines the run-event schema accepts', async () => {
    await plantSave('autosave', progressedState(), 'Autosave', WALL_CLOCK_MS)
    await game().openTitleMenu()
    await game().continueGame()
    await game().openTitleMenu()
    game().pressScreenButton(TITLE_MENU_IDS.newGame)
    game().pressScreenButton(TITLE_MENU_IDS.confirmNewGame)
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })
})
