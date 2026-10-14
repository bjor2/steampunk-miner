/**
 * The save slots and their index (#401): one autosave slot, which only the checkpoint writes, and
 * named manual slots, which only the player writes. Each slot is one file (#12). A save file
 * carries its slot's name and wall time in its header (`SaveSlotMeta`); the index lists one entry
 * per slot (`SaveSlotEntry`), the rest of it read off the file's header, so listing never parses
 * a whole save. The shell keeps each entry beside its slot file; an entry lost in a crash is
 * rebuilt from the file.
 *
 * Playtime is the authority's tick: the fixed step stands still while the game is paused or held.
 */
import { isJsonObject, isWholeNumber } from '../authority/payloadFields'

export const AUTOSAVE_SLOT = 'autosave'

/** The v1 layout's single slot (#26), which held the checkpoint. */
export const V1_CHECKPOINT_SLOT = 'slot-1'

/** As many as the v1 save folder had slot files (`electron/saveFiles.cts`, #12 Cloud quota). */
export const MANUAL_SLOT_COUNT = 9

export type SaveSlotKey = typeof AUTOSAVE_SLOT | `slot-${number}`

/** What only the writer knows: the slot's name and the wall time it was written. */
export interface SaveSlotMeta {
  name: string
  /** Wall milliseconds since 1970; null for a save written before slots had metadata (v1). */
  savedAtMs: number | null
}

/** What the slot list shows of a save, without reading it whole. */
export interface SaveSlotEntry extends SaveSlotMeta {
  slot: SaveSlotKey
  planetIndex: number
  playtimeTicks: number
  formatVersion: number
}

/** The header fields an entry reads off a save file. */
export interface SaveSlotHeader {
  formatVersion: number
  tick: number
  slot: SaveSlotMeta
  world: { planetIndex: number }
}

export const AUTOSAVE_NAME = 'Autosave'

/** The autosave as a v1 save is migrated, and a test's save with no wall time. */
export const UNTIMED_AUTOSAVE: SaveSlotMeta = { name: AUTOSAVE_NAME, savedAtMs: null }

const MANUAL_SLOT_PATTERN = /^slot-([1-9][0-9]*)$/

export function manualSlotKey(slotNumber: number): SaveSlotKey {
  return `slot-${slotNumber}`
}

export function isSaveSlotKey(value: unknown): value is SaveSlotKey {
  return value === AUTOSAVE_SLOT || isManualSlotKey(value)
}

export function isManualSlotKey(value: unknown): value is SaveSlotKey {
  if (typeof value !== 'string') return false
  const match = MANUAL_SLOT_PATTERN.exec(value)
  return match !== null && Number(match[1]) <= MANUAL_SLOT_COUNT
}

export function slotEntryOf(slot: SaveSlotKey, header: SaveSlotHeader): SaveSlotEntry {
  return {
    slot,
    name: header.slot.name,
    planetIndex: header.world.planetIndex,
    playtimeTicks: header.tick,
    savedAtMs: header.slot.savedAtMs,
    formatVersion: header.formatVersion,
  }
}

/**
 * The entry read off a whole save file, when the shell kept none: a v1 file was the single slot's
 * checkpoint, so it reads as the autosave with no wall time. Null for anything else.
 */
export function slotEntryOfFile(slot: SaveSlotKey, raw: unknown): SaveSlotEntry | null {
  if (!isJsonObject(raw) || !isJsonObject(raw.world)) return null
  const meta = raw.formatVersion === 1 ? UNTIMED_AUTOSAVE : raw.slot
  const wholeFields = [raw.formatVersion, raw.tick, raw.world.planetIndex]
  if (slotMetaProblems(meta).length > 0 || !wholeFields.every(isWholeNumber)) return null
  return slotEntryOf(slot, { ...(raw as unknown as SaveSlotHeader), slot: meta as SaveSlotMeta })
}

/** The entry as the shell kept it, or null when it is missing or not an entry. */
export function readSlotEntry(raw: unknown): SaveSlotEntry | null {
  if (!isJsonObject(raw) || !isSaveSlotKey(raw.slot)) return null
  if (slotMetaProblems(raw).length > 0) return null
  const wholeFields = [raw.planetIndex, raw.playtimeTicks, raw.formatVersion]
  return wholeFields.every(isWholeNumber) ? (raw as unknown as SaveSlotEntry) : null
}

/** A header's `slot`: a name and a whole wall time or null. */
export function slotMetaProblems(raw: unknown): string[] {
  if (!isJsonObject(raw)) return ['save.slot must be an object']
  return [
    ...(typeof raw.name === 'string' ? [] : ['save.slot.name must be text']),
    ...(isWallTime(raw.savedAtMs) ? [] : ['save.slot.savedAtMs must be a whole number or null']),
  ]
}

function isWallTime(value: unknown): boolean {
  return value === null || isWholeNumber(value)
}

/** The slot written last; a save with no wall time is the oldest, a tie goes to the autosave. */
export function latestSlotOf(entries: readonly SaveSlotEntry[]): SaveSlotEntry | null {
  return [...entries].sort(byNewestFirst)[0] ?? null
}

function byNewestFirst(a: SaveSlotEntry, b: SaveSlotEntry): number {
  const byTime = (b.savedAtMs ?? -1) - (a.savedAtMs ?? -1)
  return byTime !== 0 ? byTime : slotOrder(a.slot) - slotOrder(b.slot)
}

/** The autosave first, then the manual slots by number. */
function slotOrder(slot: SaveSlotKey): number {
  return slot === AUTOSAVE_SLOT ? 0 : Number(slot.slice('slot-'.length))
}

/** The lowest manual slot no entry holds, or null when all are taken. */
export function freeManualSlotOf(entries: readonly SaveSlotEntry[]): SaveSlotKey | null {
  const taken = new Set<string>(entries.map((entry) => entry.slot))
  return manualSlotKeys().find((slot) => !taken.has(slot)) ?? null
}

export function manualSlotKeys(): SaveSlotKey[] {
  return Array.from({ length: MANUAL_SLOT_COUNT }, (_, index) => manualSlotKey(index + 1))
}

/** The autosave first, then the manual slots by number: the order the slot list shows. */
export function inSlotOrder(entries: readonly SaveSlotEntry[]): SaveSlotEntry[] {
  return [...entries].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
}
