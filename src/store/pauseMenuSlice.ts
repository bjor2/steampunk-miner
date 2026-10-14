/**
 * The game store's pause-menu slice (#401 C, ticket 404): whether the pause menu is open, which
 * page it shows, the name the next save takes, the slot armed for an overwrite and the manual
 * slots as last listed. Escape or Start opens it while driving, and the live step holds while it
 * is open (`isLiveStepHeld`). A save goes to the checkpoint, the save folder's one writer, which
 * logs `checkpoint_saved`; nothing here is authority state, a command or part of the digest.
 *
 * A slot holding a save is written over only from its armed second press, and no slot is written
 * before the list has been read, so an unseen save is never overwritten unasked.
 */
import type { RunEventPlace } from '../logging/runEvent'
import type { SaveSlotEntry, SaveSlotKey } from '../systems/save/saveSlotIndex'
import {
  isOverwriteUnconfirmed,
  pauseMenuOpenAt,
  saveNameToWrite,
  type PauseMenuState,
} from '../systems/views/pauseMenuModel'
import { listSaveSlots, saveToManualSlot } from './checkpoint'

export interface PauseMenuValues {
  /** The pause menu while it is open; null while the game runs. */
  pauseMenu: PauseMenuState | null
}

export interface PauseMenuActions {
  openPauseMenu(): void
  closePauseMenu(): void
  /** Escape: the save page steps back to the first page, and the first page closes the menu. */
  stepBackInPauseMenu(): void
  /** Shows the save page and reads the slot list; settles once the list is in. */
  openSaveSlots(): Promise<void>
  closeSaveSlots(): void
  setPauseSaveName(name: string): void
  /** The first press on a slot holding a save; the next press there writes over it. */
  armOverwrite(slot: SaveSlotKey): void
  /**
   * Saves the session into a manual slot under the typed name, then reads the list again; returns
   * why it was refused, or [] once the save is written and listed.
   */
  saveToSlot(slot: SaveSlotKey): Promise<string[]>
}

type SliceHost = PauseMenuValues &
  PauseMenuActions & {
    playerId: string
    planetTier: number
    depthTiles: number
  }

type SetSlice = (partial: Partial<PauseMenuValues> & { focusedControlId?: string | null }) => void

type MenuChange = (menu: PauseMenuState) => PauseMenuState

export const STARTING_PAUSE_MENU: PauseMenuValues = { pauseMenu: null }

export function pauseMenuActionsOf(set: SetSlice, get: () => SliceHost): PauseMenuActions {
  const changeMenu = (change: MenuChange) => changeOpenMenu(set, get, change)
  return {
    openPauseMenu: () =>
      set({ pauseMenu: pauseMenuOpenAt(get().planetTier), focusedControlId: null }),
    closePauseMenu: () => set({ pauseMenu: null, focusedControlId: null }),
    stepBackInPauseMenu: () => {
      if (get().pauseMenu?.page === 'save') get().closeSaveSlots()
      else get().closePauseMenu()
    },
    openSaveSlots: async () => {
      changeMenu((menu) => ({ ...menu, page: 'save', slotEntries: null, armedSlot: null }))
      set({ focusedControlId: null })
      await readSlotList(changeMenu)
    },
    closeSaveSlots: () => {
      changeMenu((menu) => ({ ...menu, page: 'main', armedSlot: null }))
      set({ focusedControlId: null })
    },
    setPauseSaveName: (name) => changeMenu((menu) => ({ ...menu, saveName: name })),
    armOverwrite: (slot) => changeMenu((menu) => ({ ...menu, armedSlot: slot })),
    saveToSlot: async (slot) => {
      const problems = saveIntoSlot(get(), slot)
      changeMenu((menu) => menuAfterSave(menu, slot, problems))
      if (problems.length === 0) await readSlotList(changeMenu)
      return problems
    },
  }
}

/** A change to a menu that has since closed is dropped. */
function changeOpenMenu(set: SetSlice, get: () => SliceHost, change: MenuChange): void {
  const menu = get().pauseMenu
  if (menu !== null) set({ pauseMenu: change(menu) })
}

/** Once the writes queued so far have landed, so a save just made is listed. */
async function readSlotList(changeMenu: (change: MenuChange) => void): Promise<void> {
  const entries: readonly SaveSlotEntry[] = await listSaveSlots()
  changeMenu((menu) => ({ ...menu, slotEntries: entries }))
}

function saveIntoSlot(host: SliceHost, slot: SaveSlotKey): string[] {
  const problems = slotSaveProblems(host.pauseMenu, slot)
  if (problems.length > 0 || host.pauseMenu === null) return problems
  const name = saveNameToWrite(host.pauseMenu.saveName, host.planetTier)
  return saveToManualSlot(slot, name, runEventPlaceOf(host))
}

function slotSaveProblems(menu: PauseMenuState | null, slot: SaveSlotKey): string[] {
  if (menu === null) return ['the pause menu is closed']
  if (menu.slotEntries === null) return ['the save slots are still being read']
  return isOverwriteUnconfirmed(menu, slot) ? [`${slot} holds a save: confirm the overwrite`] : []
}

function menuAfterSave(
  menu: PauseMenuState,
  slot: SaveSlotKey,
  problems: readonly string[],
): PauseMenuState {
  const savedSlot = problems.length === 0 ? slot : menu.savedSlot
  return { ...menu, armedSlot: null, savedSlot, saveProblems: problems }
}

function runEventPlaceOf(host: SliceHost): RunEventPlace {
  return { playerId: host.playerId, planet: host.planetTier, depthTiles: host.depthTiles }
}
