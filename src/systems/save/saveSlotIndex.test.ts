import { describe, expect, it } from 'vitest'
import {
  AUTOSAVE_SLOT,
  freeManualSlotOf,
  inSlotOrder,
  isManualSlotKey,
  isSaveSlotKey,
  latestSlotOf,
  MANUAL_SLOT_COUNT,
  manualSlotKey,
  readSlotEntry,
  slotEntryOfFile,
  type SaveSlotEntry,
  type SaveSlotKey,
} from './saveSlotIndex'

function entry(slot: SaveSlotKey, savedAtMs: number | null): SaveSlotEntry {
  return { slot, name: slot, planetIndex: 3, playtimeTicks: 600, savedAtMs, formatVersion: 2 }
}

describe('save slot index', () => {
  it('names one autosave slot and nine manual slots', () => {
    expect(isSaveSlotKey(AUTOSAVE_SLOT)).toBe(true)
    expect(isManualSlotKey(AUTOSAVE_SLOT)).toBe(false)
    expect(isManualSlotKey(manualSlotKey(1))).toBe(true)
    expect(isManualSlotKey(manualSlotKey(MANUAL_SLOT_COUNT))).toBe(true)
    expect(isSaveSlotKey(manualSlotKey(MANUAL_SLOT_COUNT + 1))).toBe(false)
    expect(isSaveSlotKey('slot-0')).toBe(false)
    expect(isSaveSlotKey('../slot-1')).toBe(false)
  })

  it('reads an entry off a v2 header: name, planet, playtime, wall time and format version', () => {
    const header = {
      formatVersion: 2,
      slot: { name: 'Before the core', savedAtMs: 1_760_000_000_000 },
      tick: 7200,
      world: { planetIndex: 4 },
    }
    expect(slotEntryOfFile(manualSlotKey(2), header)).toEqual({
      slot: 'slot-2',
      name: 'Before the core',
      planetIndex: 4,
      playtimeTicks: 7200,
      savedAtMs: 1_760_000_000_000,
      formatVersion: 2,
    })
  })

  it('reads a v1 file as the autosave with no wall time', () => {
    const v1 = { formatVersion: 1, tick: 90, world: { planetIndex: 1 } }
    expect(slotEntryOfFile(AUTOSAVE_SLOT, v1)).toMatchObject({
      name: 'Autosave',
      savedAtMs: null,
      formatVersion: 1,
    })
  })

  it('reads no entry off something that is not a save header', () => {
    expect(slotEntryOfFile(AUTOSAVE_SLOT, undefined)).toBeNull()
    expect(slotEntryOfFile(AUTOSAVE_SLOT, { formatVersion: 2, tick: 1 })).toBeNull()
    expect(readSlotEntry({ ...entry('slot-1', 5), slot: 'slot-77' })).toBeNull()
    expect(readSlotEntry({ ...entry('slot-1', 5), savedAtMs: 'yesterday' })).toBeNull()
    expect(readSlotEntry(entry('slot-1', 5))).toEqual(entry('slot-1', 5))
  })

  it('takes the slot written last as the latest, a save with no wall time as the oldest', () => {
    const entries = [entry(AUTOSAVE_SLOT, null), entry('slot-2', 20), entry('slot-1', 30)]
    expect(latestSlotOf(entries)?.slot).toBe('slot-1')
    expect(latestSlotOf([entry(AUTOSAVE_SLOT, null)])?.slot).toBe(AUTOSAVE_SLOT)
    expect(latestSlotOf([])).toBeNull()
  })

  it('breaks a tie in wall time towards the autosave', () => {
    expect(latestSlotOf([entry('slot-3', 10), entry(AUTOSAVE_SLOT, 10)])?.slot).toBe(AUTOSAVE_SLOT)
  })

  it('offers the lowest free manual slot, and none when all nine are taken', () => {
    expect(freeManualSlotOf([entry(AUTOSAVE_SLOT, 1), entry('slot-1', 1)])).toBe('slot-2')
    const full = Array.from({ length: MANUAL_SLOT_COUNT }, (_, i) => entry(manualSlotKey(i + 1), 1))
    expect(freeManualSlotOf(full)).toBeNull()
  })

  it('lists the autosave first, then the manual slots by number', () => {
    const listed = inSlotOrder([entry('slot-9', 1), entry(AUTOSAVE_SLOT, 1), entry('slot-2', 1)])
    expect(listed.map((listedEntry) => listedEntry.slot)).toEqual([
      AUTOSAVE_SLOT,
      'slot-2',
      'slot-9',
    ])
  })
})
