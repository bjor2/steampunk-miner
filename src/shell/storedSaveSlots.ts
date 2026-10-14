/**
 * The browser's save folder (#26, slots #401): each slot is one localStorage item,
 * `<folder>/<slot>.json`, with its index entry beside it as `<folder>/<slot>.entry.json`, the
 * same names Electron gives its files. One `setItem` is all-or-nothing, which is the browser's
 * atomic write; the entry goes after the save, as under Electron.
 */
import type { StoredSaveSlot } from '../../electron/bridgeContract.cts'

/** The part of `Storage` the folder uses; tests pass a memory copy. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export interface StoredSaveFolder {
  write(slot: string, json: string, entryJson: string): void
  read(slot: string): string | null
  list(): StoredSaveSlot[]
  remove(slot: string): void
  setAside(slot: string): void
}

const SLOT_FILE = /^(autosave|slot-[1-9])\.json$/

/** `folderKey` is the folder's key prefix, e.g. `steampunk-miner/saves`. */
export function createStoredSaveFolder(
  storage: KeyValueStorage,
  folderKey: string,
): StoredSaveFolder {
  const slotKey = (slot: string) => `${folderKey}/${slot}.json`
  const entryKey = (slot: string) => `${folderKey}/${slot}.entry.json`
  return {
    write: (slot, json, entryJson) => {
      storage.setItem(slotKey(slot), json)
      storage.setItem(entryKey(slot), entryJson)
    },
    read: (slot) => storage.getItem(slotKey(slot)),
    list: () =>
      slotsIn(storage, `${folderKey}/`).map((slot) => ({
        slot,
        entry: storage.getItem(entryKey(slot)),
      })),
    remove: (slot) => {
      storage.removeItem(slotKey(slot))
      storage.removeItem(entryKey(slot))
    },
    setAside: (slot) => setAsideStoredSlot(storage, slotKey(slot), entryKey(slot)),
  }
}

/** The slots whose save is stored under `prefix`. */
function slotsIn(storage: KeyValueStorage, prefix: string): string[] {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? '')
  return keys
    .filter((key) => key.startsWith(prefix))
    .flatMap((key) => SLOT_FILE.exec(key.slice(prefix.length))?.[1] ?? [])
    .sort()
}

function setAsideStoredSlot(storage: KeyValueStorage, key: string, entryKey: string): void {
  const refused = storage.getItem(key)
  storage.removeItem(entryKey)
  if (refused === null) return
  storage.setItem(key.replace(/\.json$/, '.refused.json'), refused)
  storage.removeItem(key)
}
