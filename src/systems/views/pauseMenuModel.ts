/**
 * `selectPauseMenuModel` (#401 C, ticket 404): the pause menu as data. Escape or Start opens it
 * from driving and holds the fixed step; its first page offers Resume, Save game and Settings, and
 * Save game lists the manual slots with each save's name, the header's summary (planet name,
 * deepest depth with its core gauge and money, ticket 703), playtime and wall time. An
 * empty slot saves at once under the typed name; a slot holding a save asks for a second press
 * (`armOverwrite`, then "Confirm overwrite"), as Travel does (#33 section 6). A saved slot's Scrap
 * (ticket 704) asks "Scrap {slotName}? This can't be undone." in its row, with Scrap and Keep;
 * the copy is `ui.saveMenu` data in `src/data/saveMenu/` (#672 ruling (b)). Local presentation
 * only: the save itself goes through the checkpoint, never through the authority.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import SAVE_MENU_TEXT from '../../data/saveMenu/saveMenu.json'
import { manualSlotKeys, type SaveSlotEntry, type SaveSlotKey } from '../save/saveSlotIndex'
import type { FocusStop } from './menuFocus'
import { slotSummaryLineOf, type SlotSummaryLine } from './slotSummaryLine'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { uiButton, type ScreenButton } from './viewParts'

export type PausePage = 'main' | 'save'

/** What the store holds while the pause menu is open; null in the store while it is closed. */
export interface PauseMenuState {
  page: PausePage
  /**
   * The slots' entries as last listed, read again after each save; null until the save page's
   * list is in, and no slot is written before then.
   */
  slotEntries: readonly SaveSlotEntry[] | null
  /** The name the next save takes, as typed; blank saves under the planet's name. */
  saveName: string
  /** The slot whose Overwrite was pressed once; the next press there writes over it. */
  armedSlot: SaveSlotKey | null
  /** The slot whose Scrap was pressed once; its row asks before the slot is emptied. */
  scrapArmedSlot: SaveSlotKey | null
  /** The slot the last save went to, for the notice line; null before any save. */
  savedSlot: SaveSlotKey | null
  /** Why the last save was refused; empty when it was accepted. */
  saveProblems: readonly string[]
}

export interface SaveSlotRow {
  slot: SaveSlotKey
  /** The save's name, "Empty slot", or "Reading saves…" until the list is in. */
  title: string
  /** The save's planet, depth and money; null for an empty slot. */
  summary: SlotSummaryLine | null
  /** "0:12:05"; blank for an empty slot. */
  playtimeText: string
  /** The wall time the save was written, for the view to show in local time; null when unknown. */
  savedAtMs: number | null
  isEmpty: boolean
  button: ScreenButton
  /** The first Scrap press; null for an empty slot and while the row asks. */
  scrap: ScreenButton | null
  /** The question with its Scrap and Keep while this slot's Scrap is armed; null otherwise. */
  scrapConfirm: ScrapConfirm | null
}

export interface ScrapConfirm {
  question: string
  scrap: ScreenButton
  keep: ScreenButton
}

export interface PauseMenuModel {
  page: PausePage
  resume: ScreenButton
  saveGame: ScreenButton
  settings: ScreenButton
  saveName: string
  saveNameMaxChars: number
  slots: SaveSlotRow[]
  back: ScreenButton
  /** "Saved to slot 2", the refusal, or blank. */
  notice: string
  focusStops: FocusStop[]
  startFocus: string
}

/** Long enough for a sentence, short enough for the slot row and the 4 KB entry cap. */
export const SAVE_NAME_MAX_CHARS = 40

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

export function pauseMenuOpenAt(planetIndex: number): PauseMenuState {
  return {
    page: 'main',
    slotEntries: null,
    saveName: defaultSaveNameOf(planetIndex),
    armedSlot: null,
    scrapArmedSlot: null,
    savedSlot: null,
    saveProblems: [],
  }
}

export function defaultSaveNameOf(planetIndex: number): string {
  return `Planet ${planetIndex}`
}

/** The typed name cut to the cap; blank names the save after its planet. */
export function saveNameToWrite(typed: string, planetIndex: number): string {
  const trimmed = typed.trim().slice(0, SAVE_NAME_MAX_CHARS)
  return trimmed === '' ? defaultSaveNameOf(planetIndex) : trimmed
}

/** A slot holding a save is written over only from its armed second press. */
export function isOverwriteUnconfirmed(menu: PauseMenuState, slot: SaveSlotKey): boolean {
  return entryOfSlot(menu.slotEntries ?? [], slot) !== null && menu.armedSlot !== slot
}

/** A slot is emptied only from its armed second Scrap, and only when it holds a save. */
export function isScrapUnconfirmed(menu: PauseMenuState, slot: SaveSlotKey): boolean {
  return entryOfSlot(menu.slotEntries ?? [], slot) === null || menu.scrapArmedSlot !== slot
}

/** "Scrap Deep vein? This can't be undone." */
export function scrapQuestionOf(slotName: string): string {
  return SAVE_MENU_TEXT.scrapConfirm.question.replace('{slotName}', slotName)
}

/** The authority tick as hours, minutes and seconds of play: `1:02:03`. */
export function playtimeTextOf(ticks: number): string {
  const seconds = Math.floor(ticks / TICKS_PER_SECOND)
  const hours = Math.floor(seconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR))
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR
  return `${hours}:${twoDigits(minutes)}:${twoDigits(seconds % SECONDS_PER_MINUTE)}`
}

export function selectPauseMenuModel(menu: PauseMenuState): PauseMenuModel {
  const resume = uiButton(UI_IDS.pauseResume, 'Resume', { kind: 'closePauseMenu' })
  const saveGame = uiButton(UI_IDS.pauseSaveGame, 'Save game', { kind: 'openSaveSlots' })
  const settings = uiButton(UI_IDS.pauseSettings, 'Settings', { kind: 'openSettings' })
  const back = uiButton(UI_IDS.pauseBack, 'Back', { kind: 'closeSaveSlots' })
  const slots = slotRowsOf(menu)
  const focusStops =
    menu.page === 'main' ? [resume, saveGame, settings] : [...slotButtons(slots), back]
  return {
    page: menu.page,
    resume,
    saveGame,
    settings,
    saveName: menu.saveName,
    saveNameMaxChars: SAVE_NAME_MAX_CHARS,
    slots,
    back,
    notice: noticeOf(menu),
    focusStops: focusStops.map((button) => ({ id: button.id, panel: menu.page })),
    startFocus: focusStops[0].id,
  }
}

/** The buttons the page on show answers: the first page's three, or the slots and Back. */
export function pauseMenuButtonsOf(model: PauseMenuModel): ScreenButton[] {
  if (model.page === 'main') return [model.resume, model.saveGame, model.settings]
  return [...slotButtons(model.slots), model.back]
}

/** Each row's buttons in reading order: Save or Overwrite and Scrap, or the question's two. */
function slotButtons(slots: readonly SaveSlotRow[]): ScreenButton[] {
  return slots.flatMap(rowButtonsOf)
}

function rowButtonsOf(row: SaveSlotRow): ScreenButton[] {
  if (row.scrapConfirm !== null) return [row.scrapConfirm.scrap, row.scrapConfirm.keep]
  return row.scrap === null ? [row.button] : [row.button, row.scrap]
}

function slotRowsOf(menu: PauseMenuState): SaveSlotRow[] {
  const entries = menu.slotEntries ?? []
  return manualSlotKeys().map((slot) => slotRowOf(menu, slot, entryOfSlot(entries, slot)))
}

function slotRowOf(
  menu: PauseMenuState,
  slot: SaveSlotKey,
  entry: SaveSlotEntry | null,
): SaveSlotRow {
  return {
    slot,
    title: entry?.name ?? emptySlotTitleOf(menu),
    summary: entry === null ? null : slotSummaryLineOf(entry),
    playtimeText: entry === null ? '' : playtimeTextOf(entry.playtimeTicks),
    savedAtMs: entry?.savedAtMs ?? null,
    isEmpty: entry === null,
    button: slotButtonOf(menu, slot, entry),
    scrap: scrapButtonOf(menu, slot, entry),
    scrapConfirm: scrapConfirmOf(menu, entry),
  }
}

function scrapButtonOf(
  menu: PauseMenuState,
  slot: SaveSlotKey,
  entry: SaveSlotEntry | null,
): ScreenButton | null {
  if (entry === null || menu.scrapArmedSlot === slot) return null
  const label = SAVE_MENU_TEXT.scrapConfirm.scrap
  return uiButton(UI_ID_TEMPLATES.pauseSlotScrap(slot), label, { kind: 'armScrap', slot })
}

function scrapConfirmOf(menu: PauseMenuState, entry: SaveSlotEntry | null): ScrapConfirm | null {
  if (entry === null || menu.scrapArmedSlot !== entry.slot) return null
  const { scrap, keep } = SAVE_MENU_TEXT.scrapConfirm
  return {
    question: scrapQuestionOf(entry.name),
    scrap: uiButton(UI_ID_TEMPLATES.pauseSlotScrapConfirm(entry.slot), scrap, {
      kind: 'scrapSlot',
      slot: entry.slot,
    }),
    keep: uiButton(UI_ID_TEMPLATES.pauseSlotKeep(entry.slot), keep, { kind: 'keepSlot' }),
  }
}

function slotButtonOf(
  menu: PauseMenuState,
  slot: SaveSlotKey,
  entry: SaveSlotEntry | null,
): ScreenButton {
  const id = UI_ID_TEMPLATES.pauseSlotSave(slot)
  if (entry === null) return uiButton(id, 'Save here', { kind: 'saveToSlot', slot })
  if (menu.armedSlot === slot)
    return uiButton(id, 'Confirm overwrite', { kind: 'saveToSlot', slot })
  return uiButton(id, 'Overwrite', { kind: 'armOverwrite', slot })
}

function emptySlotTitleOf(menu: PauseMenuState): string {
  return menu.slotEntries === null ? 'Reading saves…' : 'Empty slot'
}

function entryOfSlot(entries: readonly SaveSlotEntry[], slot: SaveSlotKey): SaveSlotEntry | null {
  return entries.find((entry) => entry.slot === slot) ?? null
}

function noticeOf(menu: PauseMenuState): string {
  if (menu.saveProblems.length > 0) return `Not saved: ${menu.saveProblems.join('; ')}`
  return menu.savedSlot === null ? '' : `Saved to ${slotLabelOf(menu.savedSlot)}`
}

function slotLabelOf(slot: SaveSlotKey): string {
  return slot.replace('slot-', 'slot ')
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}
