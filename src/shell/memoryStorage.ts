/**
 * A localStorage stand-in for node specs (no DOM): the shell's stored save folder over a map
 * whose items a spec can read and plant, as a quit leaves them for the next start.
 */
import type { KeyValueStorage } from './storedSaveSlots'

export interface MemoryStorage extends KeyValueStorage {
  readonly items: Map<string, string>
}

export function createMemoryStorage(): MemoryStorage {
  const items = new Map<string, string>()
  return {
    items,
    get length() {
      return items.size
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}
