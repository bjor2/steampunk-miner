import { describe, expect, it } from 'vitest'
import type { SaveSlotEntry } from '../save/saveSlotIndex'
import {
  isOverwriteUnconfirmed,
  pauseMenuOpenAt,
  playtimeTextOf,
  saveNameToWrite,
  selectPauseMenuModel,
  SAVE_NAME_MAX_CHARS,
  type PauseMenuState,
} from './pauseMenuModel'

const SAVED: SaveSlotEntry = {
  slot: 'slot-2',
  name: 'Deep vein',
  planetIndex: 4,
  playtimeTicks: 60 * 3723,
  savedAtMs: 1_760_000_000_000,
  formatVersion: 2,
}

const SAVE_PAGE: PauseMenuState = { ...pauseMenuOpenAt(4), page: 'save', slotEntries: [SAVED] }

const rowOf = (menu: PauseMenuState, slot: string) =>
  selectPauseMenuModel(menu).slots.find((row) => row.slot === slot)

describe('pause menu model', () => {
  it('opens on its first page with Resume focused and the planet as the save name', () => {
    const model = selectPauseMenuModel(pauseMenuOpenAt(3))
    expect(model.focusStops.map((stop) => stop.id)).toEqual([
      'pause-resume',
      'pause-save-game',
      'pause-settings',
    ])
    expect(model.startFocus).toBe('pause-resume')
    expect(model.saveName).toBe('Planet 3')
  })

  it('lists every manual slot on the save page, a saved one with its planet and playtime', () => {
    const model = selectPauseMenuModel(SAVE_PAGE)
    expect(model.slots.map((row) => row.slot)).toEqual([
      'slot-1',
      'slot-2',
      'slot-3',
      'slot-4',
      'slot-5',
      'slot-6',
      'slot-7',
      'slot-8',
      'slot-9',
    ])
    expect(rowOf(SAVE_PAGE, 'slot-2')).toMatchObject({
      title: 'Deep vein',
      detailText: 'Planet 4 · 1:02:03',
      savedAtMs: SAVED.savedAtMs,
      isEmpty: false,
    })
    expect(rowOf(SAVE_PAGE, 'slot-1')).toMatchObject({ title: 'Empty slot', isEmpty: true })
    expect(model.focusStops.at(-1)?.id).toBe('pause-back')
  })

  it('saves into an empty slot at once and asks twice before writing over a saved one', () => {
    expect(rowOf(SAVE_PAGE, 'slot-1')?.button.action).toEqual({
      kind: 'saveToSlot',
      slot: 'slot-1',
    })
    expect(rowOf(SAVE_PAGE, 'slot-2')?.button).toMatchObject({
      label: 'Overwrite',
      action: { kind: 'armOverwrite', slot: 'slot-2' },
    })
    const armed = { ...SAVE_PAGE, armedSlot: 'slot-2' as const }
    expect(rowOf(armed, 'slot-2')?.button).toMatchObject({
      label: 'Confirm overwrite',
      action: { kind: 'saveToSlot', slot: 'slot-2' },
    })
    expect(isOverwriteUnconfirmed(SAVE_PAGE, 'slot-2')).toBe(true)
    expect(isOverwriteUnconfirmed(armed, 'slot-2')).toBe(false)
    expect(isOverwriteUnconfirmed(SAVE_PAGE, 'slot-1')).toBe(false)
  })

  it('says the slots are being read until the list is in', () => {
    const reading = { ...SAVE_PAGE, slotEntries: null }
    expect(rowOf(reading, 'slot-2')?.title).toBe('Reading saves…')
  })

  it('names the save from the typed text, trimmed and capped, or after the planet when blank', () => {
    expect(saveNameToWrite('  Ore run  ', 2)).toBe('Ore run')
    expect(saveNameToWrite(' ', 2)).toBe('Planet 2')
    expect(saveNameToWrite('x'.repeat(99), 2)).toHaveLength(SAVE_NAME_MAX_CHARS)
  })

  it('shows playtime as hours, minutes and seconds of 60 ticks', () => {
    expect(playtimeTextOf(0)).toBe('0:00:00')
    expect(playtimeTextOf(59)).toBe('0:00:00')
    expect(playtimeTextOf(60 * 3723)).toBe('1:02:03')
  })

  it('notes the slot saved to, or why the save was refused', () => {
    expect(selectPauseMenuModel({ ...SAVE_PAGE, savedSlot: 'slot-3' }).notice).toBe(
      'Saved to slot 3',
    )
    const refused = { ...SAVE_PAGE, saveProblems: ['this run has no save folder'] }
    expect(selectPauseMenuModel(refused).notice).toBe('Not saved: this run has no save folder')
  })
})
