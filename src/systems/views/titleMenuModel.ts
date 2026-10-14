/**
 * `selectTitleMenuModel` (#401 B, ticket 403): the title menu as data. The main page offers New
 * Game, Continue (the newest slot of the index, disabled with no save) and Load (the slot list,
 * disabled with no save). New Game asks first when any save exists, since the autosave is
 * replaced at the new game's first checkpoint; the named slots stay. The load page lists each slot
 * with its name, planet, playtime and wall time. Local presentation only: nothing here is a
 * command.
 *
 * Its ids live here rather than in `UI_IDS`, as a slice screen's do: the title is not one of the
 * #33 play screens.
 */
import type { SaveSlotEntry, SaveSlotKey } from '../save/saveSlotIndex'
import { latestSlotOf } from '../save/saveSlotIndex'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { FocusStop } from './menuFocus'
import { uiButton, type ScreenButton } from './viewParts'

export type TitleMenuPage = 'main' | 'load' | 'confirmNewGame'

/** The title menu the store holds open: its page, the slot index read as it opened, problems. */
export interface TitleMenu {
  page: TitleMenuPage
  slots: readonly SaveSlotEntry[]
  /** Why the last Continue or Load was refused; empty otherwise. */
  problems: readonly string[]
}

export interface TitleMenuSources {
  titleMenu: TitleMenu
  /** Minutes east of UTC at a wall time, for the saved-at text (the caller knows the zone). */
  utcOffsetMinutesAt(savedAtMs: number): number
}

export interface TitleSlotRow {
  slot: SaveSlotKey
  name: string
  planetText: string
  playtimeText: string
  savedAtText: string
  load: ScreenButton
}

export interface TitleMenuModel {
  page: TitleMenuPage
  newGame: ScreenButton
  continueGame: ScreenButton
  /** The slot Continue loads, as "Autosave · Planet 3 · 0:42:10"; null with no save. */
  continueSummary: string | null
  load: ScreenButton
  slotRows: TitleSlotRow[]
  back: ScreenButton
  confirmText: string
  confirmNewGame: ScreenButton
  cancelNewGame: ScreenButton
  problems: readonly string[]
  /** The buttons of the page shown, in reading order. */
  buttons: ScreenButton[]
  focusStops: FocusStop[]
  startFocus: string
}

export const TITLE_MENU_IDS = {
  titleMenu: 'title-menu',
  newGame: 'title-new-game',
  continueGame: 'title-continue',
  continueSummary: 'title-continue-summary',
  load: 'title-load',
  slotList: 'title-slot-list',
  back: 'title-back',
  confirmNewGame: 'title-confirm-new-game',
  cancelNewGame: 'title-cancel-new-game',
  problems: 'title-problems',
} as const

export const TITLE_MENU_ID_TEMPLATES = {
  slotRow: (slot: SaveSlotKey) => `title-slot-${slot}`,
  slotLoad: (slot: SaveSlotKey) => `title-slot-${slot}-load`,
}

const CONFIRM_TEXT =
  'Start a new game from planet 1? Nothing carries over. The autosave is replaced at the first ' +
  'checkpoint; named slots stay.'

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60_000
/** `YYYY-MM-DDTHH:MM` of an ISO string. */
const ISO_MINUTE_LENGTH = 16

export function selectTitleMenuModel(sources: TitleMenuSources): TitleMenuModel {
  const { page, slots, problems } = sources.titleMenu
  const latest = latestSlotOf(slots)
  const slotRows = slots.map((entry) => slotRowOf(entry, sources))
  const pageParts = { ...mainPageButtons(slots), ...otherPageButtons() }
  const buttons = pageButtonsOf(page, pageParts, slotRows)
  return {
    page,
    ...pageParts,
    continueSummary: latest === null ? null : slotSummaryOf(latest),
    slotRows,
    confirmText: CONFIRM_TEXT,
    problems,
    buttons,
    focusStops: buttons.map((button) => ({ id: button.id, panel: page })),
    startFocus: startFocusOf(page, buttons),
  }
}

/** Every save asks before New Game, or the new game's first checkpoint replaces the autosave. */
export function isNewGameConfirmNeeded(slots: readonly SaveSlotEntry[]): boolean {
  return slots.length > 0
}

/** Playtime as hours, minutes and seconds of authority ticks: "0:42:10". */
export function playtimeTextOf(playtimeTicks: number): string {
  const seconds = Math.floor(playtimeTicks / TICKS_PER_SECOND)
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  return `${hours}:${twoDigits(minutes % MINUTES_PER_HOUR)}:${twoDigits(seconds % SECONDS_PER_MINUTE)}`
}

/** The wall time at the player's offset, to the minute; a v1 save has none. */
export function savedAtTextOf(savedAtMs: number | null, utcOffsetMinutes: number): string {
  if (savedAtMs === null) return 'Unknown'
  const shifted = new Date(savedAtMs + utcOffsetMinutes * MS_PER_MINUTE).toISOString()
  return shifted.slice(0, ISO_MINUTE_LENGTH).replace('T', ' ')
}

function mainPageButtons(
  slots: readonly SaveSlotEntry[],
): Pick<TitleMenuModel, 'newGame' | 'continueGame' | 'load'> {
  const noSaveReason = slots.length === 0 ? 'no_save' : null
  return {
    newGame: uiButton(TITLE_MENU_IDS.newGame, 'New Game', { kind: 'pressNewGame' }),
    continueGame: {
      ...uiButton(TITLE_MENU_IDS.continueGame, 'Continue', { kind: 'continueGame' }),
      reason: noSaveReason,
    },
    load: {
      ...uiButton(TITLE_MENU_IDS.load, 'Load', { kind: 'showTitlePage', page: 'load' }),
      reason: noSaveReason,
    },
  }
}

function otherPageButtons(): Pick<TitleMenuModel, 'back' | 'confirmNewGame' | 'cancelNewGame'> {
  const toMain = { kind: 'showTitlePage', page: 'main' } as const
  return {
    back: uiButton(TITLE_MENU_IDS.back, 'Back', toMain),
    confirmNewGame: uiButton(TITLE_MENU_IDS.confirmNewGame, 'Start new game', {
      kind: 'confirmNewGame',
    }),
    cancelNewGame: uiButton(TITLE_MENU_IDS.cancelNewGame, 'Cancel', toMain),
  }
}

function pageButtonsOf(
  page: TitleMenuPage,
  parts: Pick<
    TitleMenuModel,
    'newGame' | 'continueGame' | 'load' | 'back' | 'confirmNewGame' | 'cancelNewGame'
  >,
  slotRows: readonly TitleSlotRow[],
): ScreenButton[] {
  if (page === 'load') return [...slotRows.map((row) => row.load), parts.back]
  if (page === 'confirmNewGame') return [parts.confirmNewGame, parts.cancelNewGame]
  return [parts.continueGame, parts.newGame, parts.load]
}

/**
 * The first enabled button of the page: Continue when there is a save, else New Game. On the
 * confirm page Cancel, so a double press never throws a game away.
 */
function startFocusOf(page: TitleMenuPage, buttons: readonly ScreenButton[]): string {
  if (page === 'confirmNewGame') return TITLE_MENU_IDS.cancelNewGame
  return (buttons.find((button) => button.reason === null) ?? buttons[0]).id
}

function slotRowOf(entry: SaveSlotEntry, sources: TitleMenuSources): TitleSlotRow {
  const offset = entry.savedAtMs === null ? 0 : sources.utcOffsetMinutesAt(entry.savedAtMs)
  return {
    slot: entry.slot,
    name: entry.name,
    planetText: planetTextOf(entry.planetIndex),
    playtimeText: playtimeTextOf(entry.playtimeTicks),
    savedAtText: savedAtTextOf(entry.savedAtMs, offset),
    load: uiButton(TITLE_MENU_ID_TEMPLATES.slotLoad(entry.slot), 'Load', {
      kind: 'loadSlot',
      slot: entry.slot,
    }),
  }
}

function slotSummaryOf(entry: SaveSlotEntry): string {
  return [entry.name, planetTextOf(entry.planetIndex), playtimeTextOf(entry.playtimeTicks)].join(
    ' · ',
  )
}

function planetTextOf(planetIndex: number): string {
  return `Planet ${planetIndex}`
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}
