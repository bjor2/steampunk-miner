/**
 * The game store's sheet slice (spec #678, ticket 686): which tab of the one base sheet is open and
 * which card on it shows its line after a finger's first tap. The sheet's tabs are the kernel's
 * and the slices' (`ui/registries/sheetTabs.ts`); Escape or the sheet's Close shuts it. UI state
 * only: never a command, a log line or part of the digest.
 *
 * The Ledger (ticket 688) is the pause menu's save page drawn on the sheet, so the pause slice
 * stays the one owner of the save flow and of the hold on the world: the Ledger shows exactly
 * while the pause menu is on its save page (`sheetTabShownOf`). Picking it opens that page, its
 * Close steps back to the pause menu's first page, and picking another tab leaves the pause menu.
 */
import {
  cardPressOf,
  revealedCardAfter,
  type CardPress,
  type CardPresser,
} from '../systems/views/cardReveal'
import { KERNEL_SHEET_TAB_IDS } from '../systems/views/kernelSheetTabIds'
import type { PauseMenuState } from '../systems/views/pauseMenuModel'
import { sheetTabIdProblems } from '../ui/registries/sheetTabs'
import { refuseProblems } from './authorityLink'

export interface SheetValues {
  /** The base sheet's tab while the sheet is open; null while it is shut. */
  openSheetTabId: string | null
  /** The card whose line a tap revealed; null while none is. */
  revealedSheetCardId: string | null
}

export interface SheetActions {
  /**
   * Opens the sheet on a tab, or moves an open sheet there; refused (thrown) for an unknown id.
   * The Ledger opens the pause menu's save page instead, and any other tab leaves it.
   */
  openSheet(tabId: unknown): void
  /** Escape, or the sheet's Close button; on the Ledger, back to the pause menu's first page. */
  closeSheet(): void
  /**
   * A press on a card: a finger's first tap reveals its line, so the press answers `reveal`; the
   * second tap, a click or a key answers `act`, and the card runs its action.
   */
  pressSheetCard(cardId: string, presser: CardPresser): CardPress
}

/** What the sheet reads of the pause slice, the Ledger's owner. */
interface PauseHost {
  pauseMenu: PauseMenuState | null
  openPauseMenu(): void
  closePauseMenu(): void
  openSaveSlots(): Promise<void>
  closeSaveSlots(): void
}

type SliceHost = SheetValues & PauseHost

type SetSlice = (partial: Partial<SheetValues>) => void

export const STARTING_SHEET: SheetValues = {
  openSheetTabId: null,
  revealedSheetCardId: null,
}

/** The tab the sheet shows: the Ledger while the pause menu is on its save page, else the open tab. */
export function sheetTabShownOf(host: {
  openSheetTabId: string | null
  pauseMenu: PauseMenuState | null
}): string | null {
  return isLedgerShown(host) ? KERNEL_SHEET_TAB_IDS.ledger : host.openSheetTabId
}

export function sheetActionsOf(set: SetSlice, get: () => SliceHost): SheetActions {
  return {
    openSheet: (tabId) => {
      refuseProblems(sheetTabIdProblems(tabId))
      if (tabId === KERNEL_SHEET_TAB_IDS.ledger) openLedger(set, get())
      else showTab(set, get(), tabId as string)
    },
    closeSheet: () => {
      if (isLedgerShown(get())) get().closeSaveSlots()
      else set(STARTING_SHEET)
    },
    pressSheetCard: (cardId, presser) => {
      const press = cardPressOf(get().revealedSheetCardId, cardId, presser)
      set({ revealedSheetCardId: revealedCardAfter(get().revealedSheetCardId, cardId, press) })
      return press
    },
  }
}

function isLedgerShown(host: { pauseMenu: PauseMenuState | null }): boolean {
  return host.pauseMenu?.page === 'save'
}

/** The pause menu's save page, opened from wherever the pause menu stood; the sheet's tab yields. */
function openLedger(set: SetSlice, host: SliceHost): void {
  set(STARTING_SHEET)
  if (host.pauseMenu === null) host.openPauseMenu()
  if (!isLedgerShown(host)) void host.openSaveSlots()
}

/** Leaving the Ledger for another tab leaves the pause menu, so the world runs again. */
function showTab(set: SetSlice, host: SliceHost, tabId: string): void {
  if (isLedgerShown(host)) host.closePauseMenu()
  set({ openSheetTabId: tabId, revealedSheetCardId: null })
}
