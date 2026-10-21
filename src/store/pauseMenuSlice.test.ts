import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { stateDigest } from '../systems/authority/stateDigest'
import { SAVE_FORMAT_VERSION, type SaveSlotFile } from '../systems/save/saveSlot'
import { GENERATOR_VERSION } from '../systems/generatorVersion'
import { checkpointWrites, installSaveFolder, listSaveSlots, loadSaveSlot } from './checkpoint'
import { readAuthorityState } from './authorityLink'
import { resetGameStore, useGameStore } from './gameStore'
import { resetInput, routeKeyChange, routePadChange } from './inputRuntime'
import { isLiveStepHeld } from './liveStepSlice'
import { createMemorySaveFolder } from './memorySaveFolder'
import { readPauseMenuModel } from './screenReads'

let sink: ReturnType<typeof createMemorySink>
let disk: ReturnType<typeof createMemorySaveFolder>
const WALL_CLOCK_MS = 1_760_000_000_000

beforeEach(() => {
  resetGameStore()
  resetInput()
  disk = createMemorySaveFolder()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => WALL_CLOCK_MS })
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

const pressKey = (code: string) => {
  routeKeyChange({ code, isDown: true, isRepeat: false, isShiftHeld: false })
  routeKeyChange({ code, isDown: false, isRepeat: false, isShiftHeld: false })
}

const slotFile = (slot: string) =>
  JSON.parse(disk.items.get(`saves/${slot}.json`) as string) as SaveSlotFile

const slotButton = (slot: string) =>
  readPauseMenuModel()?.slots.find((row) => row.slot === slot)?.button

async function openSavePage(): Promise<void> {
  game().openPauseMenu()
  await game().openSaveSlots()
}

describe('pause menu', () => {
  it('opens on Escape while driving, holds the fixed step, and closes on Escape', () => {
    pressKey('Escape')
    expect(game().pauseMenu?.page).toBe('main')
    expect(isLiveStepHeld(game())).toBe(true)
    pressKey('Escape')
    expect(game().pauseMenu).toBeNull()
    expect(isLiveStepHeld(game())).toBe(false)
  })

  it('opens and closes on the pad Start button', () => {
    routePadChange({ code: 'PadStart', isDown: true, isModifierHeld: false })
    routePadChange({ code: 'PadStart', isDown: false, isModifierHeld: false })
    expect(game().pauseMenu).not.toBeNull()
    routePadChange({ code: 'PadStart', isDown: true, isModifierHeld: false })
    expect(game().pauseMenu).toBeNull()
  })

  it('steps back from the save page to the first page on Escape before closing', async () => {
    await openSavePage()
    pressKey('Escape')
    expect(game().pauseMenu?.page).toBe('main')
    pressKey('Escape')
    expect(game().pauseMenu).toBeNull()
  })

  it('opens settings over itself and is back on top once settings close', () => {
    game().openPauseMenu()
    game().pressScreenButton('pause-settings')
    expect(game().isSettingsOpen).toBe(true)
    pressKey('Escape')
    expect(game().isSettingsOpen).toBe(false)
    expect(game().pauseMenu?.page).toBe('main')
  })

  it('saves into an empty slot under the typed name and lists it with its metadata', async () => {
    game().fastForward(600)
    await openSavePage()
    game().setPauseSaveName('  Before the deep vein  ')
    expect(await game().saveToSlot('slot-2')).toEqual([])
    expect((await listSaveSlots()).find((entry) => entry.slot === 'slot-2')).toEqual({
      slot: 'slot-2',
      name: 'Before the deep vein',
      planetIndex: 1,
      playtimeTicks: readAuthorityState().tick,
      savedAtMs: WALL_CLOCK_MS,
      formatVersion: SAVE_FORMAT_VERSION,
      generatorVersion: GENERATOR_VERSION,
      summary: expect.objectContaining({ planetIndex: 1, deepestMetres: 0 }),
    })
    expect(readPauseMenuModel()?.slots[1].title).toBe('Before the deep vein')
    expect(readPauseMenuModel()?.notice).toBe('Saved to slot 2')
  })

  it('logs the manual save as checkpoint_saved for its slot', async () => {
    await openSavePage()
    await game().saveToSlot('slot-1')
    const saved = sink.events.filter((line) => line.event === 'checkpoint_saved')
    expect(saved.map((line) => (line.data as { slot: string }).slot)).toEqual(['slot-1'])
  })

  it('names a save with a blank name after its planet', async () => {
    await openSavePage()
    game().setPauseSaveName('   ')
    await game().saveToSlot('slot-1')
    expect(slotFile('slot-1').slot.name).toBe('Planet 1')
  })

  it('refuses to write over a saved slot until the overwrite is confirmed', async () => {
    await openSavePage()
    game().setPauseSaveName('First')
    await game().saveToSlot('slot-1')
    game().setPauseSaveName('Second')
    expect(await game().saveToSlot('slot-1')).toEqual([
      'slot-1 holds a save: confirm the overwrite',
    ])
    await checkpointWrites()
    expect(slotFile('slot-1').slot.name).toBe('First')
    game().armOverwrite('slot-1')
    expect(await game().saveToSlot('slot-1')).toEqual([])
    expect(slotFile('slot-1').slot.name).toBe('Second')
  })

  it('asks for a second press on a saved slot button before it writes over it', async () => {
    await openSavePage()
    await game().saveToSlot('slot-3')
    game().setPauseSaveName('Again')
    game().pressScreenButton('pause-slot-3-save')
    expect(slotButton('slot-3')?.label).toBe('Confirm overwrite')
    game().pressScreenButton('pause-slot-3-save')
    await game().openSaveSlots()
    expect(slotFile('slot-3').slot.name).toBe('Again')
    expect(slotButton('slot-3')?.label).toBe('Overwrite')
  })

  it('keeps a slot intact when Keep answers the Scrap question', async () => {
    await openSavePage()
    game().setPauseSaveName('Keeper')
    await game().saveToSlot('slot-2')
    game().pressScreenButton('pause-slot-2-scrap')
    expect(game().focusedControlId).toBe('pause-slot-2-keep')
    game().pressScreenButton('pause-slot-2-keep')
    await checkpointWrites()
    expect(slotFile('slot-2').slot.name).toBe('Keeper')
    expect(readPauseMenuModel()?.slots[1]).toMatchObject({ title: 'Keeper', scrapConfirm: null })
    expect(game().focusedControlId).toBe('pause-slot-2-scrap')
  })

  it('empties a slot on the second Scrap, lists it empty and logs save_deleted', async () => {
    await openSavePage()
    await game().saveToSlot('slot-2')
    game().armScrap('slot-2')
    expect(await game().scrapSlot('slot-2')).toEqual([])
    expect(disk.items.has('saves/slot-2.json')).toBe(false)
    expect((await listSaveSlots()).map((entry) => entry.slot)).not.toContain('slot-2')
    expect(readPauseMenuModel()?.slots[1]).toMatchObject({ isEmpty: true, scrap: null })
    expect(readPauseMenuModel()?.notice).toBe('')
    const deleted = sink.events.filter((line) => line.event === 'save_deleted')
    expect(deleted.map((line) => line.data)).toEqual([{ slot: 'slot-2' }])
  })

  it('refuses to scrap a slot whose Scrap was not pressed first', async () => {
    await openSavePage()
    await game().saveToSlot('slot-3')
    expect(await game().scrapSlot('slot-3')).toEqual(['slot-3: press Scrap again to confirm'])
    await checkpointWrites()
    expect(disk.items.has('saves/slot-3.json')).toBe(true)
    expect(sink.events.some((line) => line.event === 'save_deleted')).toBe(false)
  })

  it('backs out of the Scrap question on Escape before leaving the save page', async () => {
    await openSavePage()
    await game().saveToSlot('slot-1')
    game().armScrap('slot-1')
    pressKey('Escape')
    expect(game().pauseMenu).toMatchObject({ page: 'save', scrapArmedSlot: null })
    await checkpointWrites()
    expect(disk.items.has('saves/slot-1.json')).toBe(true)
  })

  it('writes no slot before the slot list has been read', async () => {
    game().openPauseMenu()
    const reading = game().openSaveSlots()
    expect(await game().saveToSlot('slot-1')).toEqual(['the save slots are still being read'])
    await reading
    await checkpointWrites()
    expect(disk.items.has('saves/slot-1.json')).toBe(false)
  })

  it('loads a saved slot back to the identical state digest', async () => {
    game().fastForward(300)
    await openSavePage()
    await game().saveToSlot('slot-4')
    const savedDigest = stateDigest(readAuthorityState())
    game().closePauseMenu()
    game().fastForward(300)
    expect(stateDigest(readAuthorityState())).not.toBe(savedDigest)
    const checkpoint = await loadSaveSlot('slot-4')
    if (checkpoint === null || !('state' in checkpoint)) throw new Error('slot-4 did not load')
    game().resumeCheckpoint(checkpoint)
    expect(stateDigest(readAuthorityState())).toBe(savedDigest)
    expect(slotFile('slot-4').digest).toBe(savedDigest)
  })
})
