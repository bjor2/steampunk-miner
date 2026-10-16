/**
 * A browser's save folder in IndexedDB (#470 P1-8, ticket 479), the mirror beside localStorage
 * (`mirroredSaveFolder.ts`): a slot's save and its index entry sit under the same key
 * (`<folder>/<slot>`) in two object stores written in one transaction, so a slot never holds a
 * save with another write's entry. A refused save moves to `<folder>/<slot>.refused`, as
 * localStorage's `.refused.json`.
 */
import type { StoredSaveSlot } from '../../electron/bridgeContract.cts'
import type { ShellSaveFolder } from './mirroredSaveFolder'

const DATABASE_NAME = 'steampunk-miner-saves'
const DATABASE_VERSION = 1
const SAVES = 'saves'
const ENTRIES = 'entries'
const SLOT_NAME = /^(autosave|slot-[1-9])$/
const REFUSED_SUFFIX = '.refused'

/** `folderKey` is the folder's key prefix, e.g. `steampunk-miner/saves`. */
export function createIndexedSaveFolder(folderKey: string): ShellSaveFolder {
  let opened: Promise<IDBDatabase> | null = null
  const database = () => (opened ??= openSaveDatabase())
  const keyOf = (slot: string) => `${folderKey}/${slot}`
  return {
    write: async (slot, json, entryJson) => putSlot(await database(), keyOf(slot), json, entryJson),
    read: async (slot) => readSave(await database(), keyOf(slot)),
    list: async () => listSlots(await database(), `${folderKey}/`),
    remove: async (slot) => removeSlot(await database(), keyOf(slot)),
    setAside: async (slot) => setAsideSlot(await database(), keyOf(slot)),
  }
}

function openSaveDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  request.onupgradeneeded = () => {
    request.result.createObjectStore(SAVES)
    request.result.createObjectStore(ENTRIES)
  }
  return resultOf(request)
}

function putSlot(db: IDBDatabase, key: string, json: string, entryJson: string): Promise<void> {
  const transaction = db.transaction([SAVES, ENTRIES], 'readwrite')
  transaction.objectStore(SAVES).put(json, key)
  transaction.objectStore(ENTRIES).put(entryJson, key)
  return completionOf(transaction)
}

async function readSave(db: IDBDatabase, key: string): Promise<string | null> {
  const text = await resultOf(db.transaction(SAVES).objectStore(SAVES).get(key))
  return typeof text === 'string' ? text : null
}

/** Every slot holding a save under `prefix`, with its entry's text (null when none was kept). */
async function listSlots(db: IDBDatabase, prefix: string): Promise<StoredSaveSlot[]> {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`)
  const transaction = db.transaction([SAVES, ENTRIES])
  const [saveKeys, entryKeys, entries] = await Promise.all([
    resultOf(transaction.objectStore(SAVES).getAllKeys(range)),
    resultOf(transaction.objectStore(ENTRIES).getAllKeys(range)),
    resultOf(transaction.objectStore(ENTRIES).getAll(range)),
  ])
  const entryByKey = new Map(entryKeys.map((key, index) => [String(key), entries[index]]))
  return saveKeys
    .map((key) => String(key))
    .flatMap((key) => storedSlotOf(key, prefix, entryByKey.get(key)))
    .sort((a, b) => a.slot.localeCompare(b.slot))
}

function storedSlotOf(key: string, prefix: string, entry: unknown): StoredSaveSlot[] {
  const slot = key.slice(prefix.length)
  if (!SLOT_NAME.test(slot)) return []
  return [{ slot, entry: typeof entry === 'string' ? entry : null }]
}

function removeSlot(db: IDBDatabase, key: string): Promise<void> {
  const transaction = db.transaction([SAVES, ENTRIES], 'readwrite')
  transaction.objectStore(SAVES).delete(key)
  transaction.objectStore(ENTRIES).delete(key)
  return completionOf(transaction)
}

/**
 * In one transaction, so the save is never in neither place nor in both; the move is queued from
 * the read's own callback, while the transaction is still active in every engine.
 */
function setAsideSlot(db: IDBDatabase, key: string): Promise<void> {
  const transaction = db.transaction([SAVES, ENTRIES], 'readwrite')
  const completion = completionOf(transaction)
  const saves = transaction.objectStore(SAVES)
  transaction.objectStore(ENTRIES).delete(key)
  const reading = saves.get(key)
  reading.onsuccess = () => moveRefusedSave(saves, key, reading.result)
  return completion
}

function moveRefusedSave(saves: IDBObjectStore, key: string, refused: unknown): void {
  if (refused === undefined) return
  saves.put(refused, `${key}${REFUSED_SUFFIX}`)
  saves.delete(key)
}

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** A full disk aborts the transaction; its `error` is the `QuotaExceededError`. */
function completionOf(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
