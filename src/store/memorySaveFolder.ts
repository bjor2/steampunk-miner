/**
 * The browser's save folder over a memory storage, for node specs: what a quit leaves in the
 * folder for the next start, readable and plantable through `items` (`saves/<slot>.json`).
 */
import { createMemoryStorage } from '../shell/memoryStorage'
import { createStoredSaveFolder } from '../shell/storedSaveSlots'
import type { SaveFolder } from './saveFolder'

export const MEMORY_FOLDER_KEY = 'saves'

export function createMemorySaveFolder(): { items: Map<string, string>; folder: SaveFolder } {
  const storage = createMemoryStorage()
  const stored = createStoredSaveFolder(storage, MEMORY_FOLDER_KEY)
  const folder: SaveFolder = {
    list: async () => stored.list(),
    read: async (slot) => stored.read(slot),
    write: async (slot, json, entryJson) => stored.write(slot, json, entryJson),
    remove: async (slot) => stored.remove(slot),
    setAside: async (slot) => stored.setAside(slot),
  }
  return { items: storage.items, folder }
}
