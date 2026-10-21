import { describe, expect, it } from 'vitest'
import { GENERATOR_VERSION } from '../systems/generatorVersion'
import type { SaveSlotEntry } from '../systems/save/saveSlotIndex'
import { LEDGER_TOAST_TEXT } from '../systems/views/ledgerToast'
import {
  defaultSaveNameOf,
  pauseMenuOpenAt,
  selectPauseMenuModel,
  type PauseMenuState,
} from '../systems/views/pauseMenuModel'
import { fillSaveMenuText, SAVE_MENU_TEXT } from '../systems/views/saveMenuText'
import { UNKNOWN_SUMMARY_TEXT } from '../systems/views/slotSummaryLine'
import { selectTitleMenuModel, type TitleMenu } from '../systems/views/titleMenuModel'
import { pauseSlotTextOf, SAVE_PAGE_TEXT } from './ledger/ledgerElements'
import { PAUSED_TEXT } from './pause/pauseMenuElements'
import {
  GAME_NAME_TEXT,
  LOAD_REFUSED_TEXT,
  NEW_GAME_CONFIRM_TEXT,
  NEW_GAME_FACTS,
  titleSlotTextOf,
} from './title/titleMenuElements'

// Ticket 672 (#672 ruling (b)): every shipped save-menu string is `ui.saveMenu` data. Each line of
// the data must reach the screen through some model or element, with its `{name}`s filled.

const SAVED: SaveSlotEntry = {
  slot: 'slot-2',
  name: 'Before the core',
  planetIndex: 5,
  playtimeTicks: 2 * 3600 * 60,
  savedAtMs: Date.UTC(2026, 9, 14, 19, 30),
  formatVersion: 3,
  generatorVersion: GENERATOR_VERSION,
}
const OLDER: SaveSlotEntry = { ...SAVED, slot: 'slot-3', generatorVersion: GENERATOR_VERSION - 1 }
const NEWER: SaveSlotEntry = { ...SAVED, slot: 'slot-4', generatorVersion: GENERATOR_VERSION + 1 }
const UNDATED: SaveSlotEntry = { ...SAVED, slot: 'autosave', savedAtMs: null }

function titleShownOf(titleMenu: Partial<TitleMenu>): unknown[] {
  const model = selectTitleMenuModel({
    titleMenu: { page: 'main', slots: [], problems: [], ...titleMenu },
    utcOffsetMinutesAt: () => 0,
  })
  return [model, ...model.slotRows.map(titleSlotTextOf)]
}

function pauseShownOf(menu: Partial<PauseMenuState>): unknown[] {
  const model = selectPauseMenuModel({ ...pauseMenuOpenAt(4), page: 'save', ...menu })
  return [model, ...model.slots.map((row) => pauseSlotTextOf(row, 'today'))]
}

/** Every string a player can be shown by the save menus, across their pages and states. */
function everyShownString(): string[] {
  const shown = [
    ...titleShownOf({ slots: [UNDATED, SAVED, OLDER, NEWER], page: 'load' }),
    ...titleShownOf({ slots: [SAVED], page: 'confirmNewGame' }),
    ...pauseShownOf({ page: 'main', slotEntries: null }),
    ...pauseShownOf({ slotEntries: [SAVED], savedSlot: 'slot-2' }),
    ...pauseShownOf({ slotEntries: [SAVED], armedSlot: 'slot-2', saveProblems: ['disk full'] }),
    ...pauseShownOf({ slotEntries: [SAVED], scrapArmedSlot: 'slot-2' }),
    defaultSaveNameOf(4),
    ...[GAME_NAME_TEXT, NEW_GAME_CONFIRM_TEXT, NEW_GAME_FACTS, LOAD_REFUSED_TEXT],
    ...[PAUSED_TEXT, SAVE_PAGE_TEXT, LEDGER_TOAST_TEXT, UNKNOWN_SUMMARY_TEXT],
  ]
  return shown.flatMap(stringsIn)
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(stringsIn)
}

function dataLinesOf(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  return Object.entries(value as object).flatMap(([key, child]) =>
    dataLinesOf(child, path === '' ? key : `${path}.${key}`),
  )
}

/** A data line as a whole-string pattern, each `{name}` standing for the filled value. */
function patternOf(template: string): RegExp {
  const escaped = template.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\{\w+\}/g, '.+')}$`)
}

describe('save menu copy (ticket 672)', () => {
  it('shows every line of ui.saveMenu on some save menu page, its names filled', () => {
    const shown = everyShownString()
    const unshown = dataLinesOf(SAVE_MENU_TEXT, 'ui.saveMenu').filter(
      ([, template]) => !shown.some((text) => patternOf(template).test(text)),
    )
    expect(unshown).toEqual([])
  })

  it('leaves no {name} unfilled in anything the menus show', () => {
    expect(everyShownString().filter((text) => /\{\w+\}/.test(text))).toEqual([])
  })

  it('fills each {name} from its value and keeps a name it is not given', () => {
    expect(fillSaveMenuText('Scrap {slotName}? {other}', { slotName: 'Ore $& run' })).toBe(
      'Scrap Ore $& run? {other}',
    )
  })

  it('keeps the shipped wording and the Planet {n} default name', () => {
    expect(defaultSaveNameOf(12)).toBe('Planet 12')
    expect(selectPauseMenuModel({ ...pauseMenuOpenAt(4), savedSlot: 'slot-7' }).notice).toBe(
      'Saved to slot 7',
    )
    expect(
      titleSlotTextOf(
        selectTitleMenuModel({
          titleMenu: { page: 'load', slots: [UNDATED], problems: [] },
          utcOffsetMinutesAt: () => 0,
        }).slotRows[0],
      ).tooltipLines,
    ).toEqual(['Saved Unknown'])
  })
})
