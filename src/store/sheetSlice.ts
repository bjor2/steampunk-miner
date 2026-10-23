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
 *
 * A moment that must show the car (the unlock reveal, ticket 718) steps a full sheet aside and
 * brings it back on the same tab; a docked sheet stays, as the car is in view beside it.
 *
 * A sheet a dock opens (the Upgrade bay's Outfitter) is that bay's one menu (ticket 734): its
 * close, Escape or Close, shuts it and leaves the bay in one step, so a dock never stacks two
 * menus that take two closes. A sheet the player opens from a bay's button closes back to the bay.
 *
 * On desktop (ticket 768) Tab opens the sheet on its first shown tab and shuts it as Close does,
 * and a place's letter opens the tab bearing that place's word. Neither opens the sheet over the
 * pause menu's first page; from the Ledger both work, as picking a tab there does.
 */
import {
  cardPressOf,
  revealedCardAfter,
  type CardPress,
  type CardPresser,
} from '../systems/views/cardReveal'
import { KERNEL_SHEET_TAB_IDS } from '../systems/views/kernelSheetTabIds'
import type { PauseMenuState } from '../systems/views/pauseMenuModel'
import type { SheetPlacement } from '../systems/views/sheetLayout'
import { tabAtPlace, type SheetPlace } from '../systems/views/sheetPlaces'
import { sheetTabIdProblems, shownSheetTabsOn, type SheetTabHead } from '../ui/registries/sheetTabs'
import { readAuthorityState, refuseProblems } from './authorityLink'

export interface SheetValues {
  /** The base sheet's tab while the sheet is open; null while it is shut. */
  openSheetTabId: string | null
  /** The card whose line a tap revealed; null while none is. */
  revealedSheetCardId: string | null
  /** A full sheet is out of the way for a moment, its tab kept for its return. */
  isSheetSteppedAside: boolean
  /** The sheet opened with the dock, so it is the bay's menu and its close leaves the bay. */
  isSheetTheBayMenu: boolean
}

export interface SheetActions {
  /**
   * Opens the sheet on a tab, or moves an open sheet there; refused (thrown) for an unknown id.
   * The Ledger opens the pause menu's save page instead, and any other tab leaves it.
   */
  openSheet(tabId: unknown): void
  /**
   * Opens the sheet as the docked bay's own menu (ticket 734), as the bay's screen mounts with
   * the dock; refused (thrown) for an unknown id, as `openSheet` is.
   */
  openSheetAsBayMenu(tabId: unknown): void
  /**
   * Escape, or the sheet's Close button; on the Ledger, back to the pause menu's first page. The
   * bay's menu also leaves the bay (ticket 734).
   */
  closeSheet(): void
  /**
   * Shuts the sheet where it stands, as `closeSheet` does but never leaving the bay: the debug
   * API's switch, which sends no command (ticket 734).
   */
  shutSheetInPlace(): void
  /** The dock ended: the bay's menu shuts with it, sending nothing; any other sheet stays. */
  shutBayMenuSheet(): void
  /**
   * A press on a card: a finger's first tap reveals its line, so the press answers `reveal`; the
   * second tap, a click or a key answers `act`, and the card runs its action.
   */
  pressSheetCard(cardId: string, presser: CardPresser): CardPress
  /** Slides a full sheet out while the open tab stays open; a docked sheet stays. */
  stepSheetAside(): void
  /** Slides the stepped-aside sheet back in on its tab. */
  bringSheetBack(): void
  /** Tab (ticket 768): shuts a shown sheet as Close does, else opens it on its first shown tab. */
  toggleSheet(): void
  /** A place's key (ticket 768): opens the shown tab bearing the place's word; none, nothing. */
  openSheetAtPlace(place: SheetPlace): void
}

/** What the sheet reads of the pause slice, the Ledger's owner. */
interface PauseHost {
  pauseMenu: PauseMenuState | null
  openPauseMenu(): void
  closePauseMenu(): void
  openSaveSlots(): Promise<void>
  closeSaveSlots(): void
}

/** What the bay's menu reads of the store to leave the bay on its close. */
interface DockHost {
  undock(): void
}

type SliceHost = SheetValues & PauseHost & DockHost & { playerId: string }

type SetSlice = (partial: Partial<SheetValues>) => void

export const STARTING_SHEET: SheetValues = {
  openSheetTabId: null,
  revealedSheetCardId: null,
  isSheetSteppedAside: false,
  isSheetTheBayMenu: false,
}

/** The tab the sheet shows: the Ledger while the pause menu is on its save page, else the open tab. */
export function sheetTabShownOf(host: {
  openSheetTabId: string | null
  pauseMenu: PauseMenuState | null
}): string | null {
  return isLedgerShown(host) ? KERNEL_SHEET_TAB_IDS.ledger : host.openSheetTabId
}

/** The tab the sheet at `placement` draws: none while a full sheet has stepped aside. */
export function sheetTabDrawnAt(
  host: Pick<SheetValues, 'openSheetTabId' | 'isSheetSteppedAside'> & {
    pauseMenu: PauseMenuState | null
  },
  placement: SheetPlacement,
): string | null {
  return isSteppedAsideAt(host, placement) ? null : sheetTabShownOf(host)
}

export function sheetActionsOf(set: SetSlice, get: () => SliceHost): SheetActions {
  return {
    openSheet: (tabId) => openSheetOn(set, get(), tabId),
    openSheetAsBayMenu: (tabId) => {
      openSheetOn(set, get(), tabId)
      set({ isSheetTheBayMenu: true })
    },
    closeSheet: () => closeSheetAndBayMenu(set, get()),
    shutSheetInPlace: () => shutShownSheet(set, get()),
    shutBayMenuSheet: () => {
      if (get().isSheetTheBayMenu) set(STARTING_SHEET)
    },
    pressSheetCard: (cardId, presser) => {
      const press = cardPressOf(get().revealedSheetCardId, cardId, presser)
      set({ revealedSheetCardId: revealedCardAfter(get().revealedSheetCardId, cardId, press) })
      return press
    },
    stepSheetAside: () => set({ isSheetSteppedAside: true }),
    bringSheetBack: () => set({ isSheetSteppedAside: false }),
    toggleSheet: () => toggleSheetOn(set, get()),
    openSheetAtPlace: (place) => openSheetAtPlaceOn(set, get(), place),
  }
}

function toggleSheetOn(set: SetSlice, host: SliceHost): void {
  if (sheetTabShownOf(host) !== null) return closeSheetAndBayMenu(set, host)
  if (host.pauseMenu !== null) return
  const [first] = shownTabsOf(host)
  if (first !== undefined) openSheetOn(set, host, first.id)
}

function openSheetAtPlaceOn(set: SetSlice, host: SliceHost, place: SheetPlace): void {
  if (isPauseMenuFirstPage(host)) return
  const tab = tabAtPlace(shownTabsOf(host), place)
  if (tab !== null) openSheetOn(set, host, tab.id)
}

function shownTabsOf(host: SliceHost): readonly SheetTabHead[] {
  return shownSheetTabsOn(readAuthorityState(), host.playerId)
}

function isPauseMenuFirstPage(host: { pauseMenu: PauseMenuState | null }): boolean {
  return host.pauseMenu !== null && !isLedgerShown(host)
}

function isSteppedAsideAt(
  host: Pick<SheetValues, 'isSheetSteppedAside'>,
  placement: SheetPlacement,
): boolean {
  return host.isSheetSteppedAside && placement === 'full'
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

function openSheetOn(set: SetSlice, host: SliceHost, tabId: unknown): void {
  refuseProblems(sheetTabIdProblems(tabId))
  if (tabId === KERNEL_SHEET_TAB_IDS.ledger) openLedger(set, host)
  else showTab(set, host, tabId as string)
}

/** The bay's menu leaves the bay with its close; the Ledger over it only steps back. */
function closeSheetAndBayMenu(set: SetSlice, host: SliceHost): void {
  const isLeavingTheBay = host.isSheetTheBayMenu && !isLedgerShown(host)
  shutShownSheet(set, host)
  if (isLeavingTheBay) host.undock()
}

/** The Ledger steps back to the pause menu's first page; any other tab shuts. */
function shutShownSheet(set: SetSlice, host: SliceHost): void {
  if (isLedgerShown(host)) host.closeSaveSlots()
  else set(STARTING_SHEET)
}

/** Leaving the Ledger for another tab leaves the pause menu, so the world runs again. */
function showTab(set: SetSlice, host: SliceHost, tabId: string): void {
  if (isLedgerShown(host)) host.closePauseMenu()
  set({ openSheetTabId: tabId, revealedSheetCardId: null })
}
