import { describe, expect, it } from 'vitest'
import { GENERATOR_VERSION } from '../generatorVersion'
import { planetDisplayNameOf } from '../registries/planetRow'
import type { SaveSlotEntry } from '../save/saveSlotIndex'
import {
  isNewGameConfirmNeeded,
  playtimeTextOf,
  savedAtTextOf,
  selectTitleMenuModel,
  TITLE_MENU_IDS,
  type TitleMenu,
} from './titleMenuModel'

const OSLO_SUMMER = 120

const AUTOSAVE: SaveSlotEntry = {
  slot: 'autosave',
  name: 'Autosave',
  planetIndex: 3,
  playtimeTicks: (42 * 60 + 10) * 60,
  savedAtMs: Date.UTC(2026, 9, 14, 18, 7),
  formatVersion: 2,
  generatorVersion: GENERATOR_VERSION,
}

const MANUAL: SaveSlotEntry = {
  slot: 'slot-2',
  name: 'Before the core',
  planetIndex: 5,
  playtimeTicks: (2 * 3600 + 5) * 60,
  savedAtMs: Date.UTC(2026, 9, 14, 19, 30),
  formatVersion: 2,
  generatorVersion: GENERATOR_VERSION,
}

function modelOf(titleMenu: Partial<TitleMenu>) {
  return selectTitleMenuModel({
    titleMenu: { page: 'main', slots: [], problems: [], ...titleMenu },
    utcOffsetMinutesAt: () => OSLO_SUMMER,
  })
}

describe('title menu model (ticket 403)', () => {
  it('disables Continue and Load and focuses New Game when no save exists', () => {
    const model = modelOf({ slots: [] })
    expect(model.continueGame.reason).toBe('no_save')
    expect(model.load.reason).toBe('no_save')
    expect(model.newGame.reason).toBeNull()
    expect(model.continueSummary).toBeNull()
    expect(model.startFocus).toBe(TITLE_MENU_IDS.newGame)
  })

  it('offers Continue on the newest slot and focuses it when a save exists', () => {
    const model = modelOf({ slots: [AUTOSAVE, MANUAL] })
    expect(model.continueGame.reason).toBeNull()
    expect(model.continueSummary).toBe(`Before the core · ${planetDisplayNameOf(5)} · 2:00:05`)
    expect(model.startFocus).toBe(TITLE_MENU_IDS.continueGame)
    expect(model.buttons.map((button) => button.id)).toEqual([
      TITLE_MENU_IDS.continueGame,
      TITLE_MENU_IDS.newGame,
      TITLE_MENU_IDS.load,
    ])
  })

  it('lists every slot on the load page with its name, planet, playtime and wall time', () => {
    const model = modelOf({ page: 'load', slots: [AUTOSAVE, MANUAL] })
    expect(
      model.slotRows.map(({ slot, name, planetText, playtimeText, savedAtText }) => ({
        slot,
        name,
        planetText,
        playtimeText,
        savedAtText,
      })),
    ).toEqual([
      {
        slot: 'autosave',
        name: 'Autosave',
        planetText: planetDisplayNameOf(3),
        playtimeText: '0:42:10',
        savedAtText: '2026-10-14 20:07',
      },
      {
        slot: 'slot-2',
        name: 'Before the core',
        planetText: planetDisplayNameOf(5),
        playtimeText: '2:00:05',
        savedAtText: '2026-10-14 21:30',
      },
    ])
    expect(model.buttons.map((button) => button.action)).toEqual([
      { kind: 'loadSlot', slot: 'autosave' },
      { kind: 'loadSlot', slot: 'slot-2' },
      { kind: 'showTitlePage', page: 'main' },
    ])
  })

  it('flags a slot another generator made before it is loaded, and never an entry that cannot tell', () => {
    const slots = [
      { ...AUTOSAVE, generatorVersion: null },
      MANUAL,
      { ...MANUAL, slot: 'slot-2' as const, generatorVersion: GENERATOR_VERSION - 1 },
      { ...MANUAL, slot: 'slot-3' as const, generatorVersion: GENERATOR_VERSION + 1 },
    ]
    const model = modelOf({ page: 'load', slots })
    expect(model.slotRows.map((row) => row.generatorNote)).toEqual([
      null,
      null,
      'Made by an older world generator: it updates as it loads',
      'Made by a newer build: this build cannot load it',
    ])
    expect(model.slotRows.every((row) => row.load.reason === null)).toBe(true)
  })

  it('starts the confirm page on Cancel, so a double press never throws a game away', () => {
    const model = modelOf({ page: 'confirmNewGame', slots: [AUTOSAVE] })
    expect(model.buttons.map((button) => button.id)).toEqual([
      TITLE_MENU_IDS.confirmNewGame,
      TITLE_MENU_IDS.cancelNewGame,
    ])
    expect(model.startFocus).toBe(TITLE_MENU_IDS.cancelNewGame)
  })

  it('asks before a new game whenever any save exists', () => {
    expect(isNewGameConfirmNeeded([])).toBe(false)
    expect(isNewGameConfirmNeeded([MANUAL])).toBe(true)
  })

  it('writes playtime as hours, minutes and seconds of ticks', () => {
    expect(playtimeTextOf(0)).toBe('0:00:00')
    expect(playtimeTextOf(59)).toBe('0:00:00')
    expect(playtimeTextOf(60 * 61)).toBe('0:01:01')
    expect(playtimeTextOf(60 * 3600 * 12)).toBe('12:00:00')
  })

  it('writes the wall time at the given offset, and Unknown for a save without one', () => {
    expect(savedAtTextOf(Date.UTC(2026, 0, 1, 23, 30), 60)).toBe('2026-01-02 00:30')
    expect(savedAtTextOf(null, 60)).toBe('Unknown')
  })
})
