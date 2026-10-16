import { describe, expect, it, vi } from 'vitest'
import { createMemoryStorage, type MemoryStorage } from './memoryStorage'
import { mirrorSaveFolder, settlingFolderOf, type ShellSaveFolder } from './mirroredSaveFolder'
import { createStoredSaveFolder } from './storedSaveSlots'

const FOLDER = 'steampunk-miner/saves'

const saveAt = (saveEpoch: number) => JSON.stringify({ formatVersion: 3, saveEpoch })
const entryAt = (saveEpoch: number) => JSON.stringify({ slot: 'autosave', epoch: saveEpoch })

interface Store {
  items: MemoryStorage['items']
  folder: ShellSaveFolder
}

/** A store over memory; `refuseWrites` makes every write throw as a full localStorage does. */
function storeOnMemory(refuseWrites = false): Store {
  const storage = createMemoryStorage()
  const setItem = storage.setItem
  storage.setItem = (key, value) => {
    if (refuseWrites) throw new DOMException('full', 'QuotaExceededError')
    setItem(key, value)
  }
  return { items: storage.items, folder: settlingFolderOf(createStoredSaveFolder(storage, FOLDER)) }
}

function mirroredPair(options: { isPrimaryFull?: boolean; isMirrorFull?: boolean } = {}) {
  const primary = storeOnMemory(options.isPrimaryFull)
  const mirror = storeOnMemory(options.isMirrorFull)
  return { primary, mirror, folder: mirrorSaveFolder(primary.folder, mirror.folder) }
}

describe('mirrored save folder', () => {
  it('writes every slot to localStorage and to the IndexedDB mirror', async () => {
    const { primary, mirror, folder } = mirroredPair()
    await folder.write('autosave', saveAt(1), entryAt(1))
    for (const store of [primary, mirror]) {
      expect(store.items.get(`${FOLDER}/autosave.json`)).toBe(saveAt(1))
      expect(store.items.get(`${FOLDER}/autosave.entry.json`)).toBe(entryAt(1))
    }
  })

  it('reads the copy with the newer saveEpoch, in either store', async () => {
    const { primary, mirror, folder } = mirroredPair()
    await primary.folder.write('autosave', saveAt(3), entryAt(3))
    await mirror.folder.write('autosave', saveAt(4), entryAt(4))
    expect(await folder.read('autosave')).toBe(saveAt(4))
    await primary.folder.write('autosave', saveAt(5), entryAt(5))
    expect(await folder.read('autosave')).toBe(saveAt(5))
  })

  it('lists each slot once, with the entry of its newer copy', async () => {
    const { primary, mirror, folder } = mirroredPair()
    await folder.write('slot-2', saveAt(1), entryAt(1))
    await primary.folder.write('autosave', saveAt(2), entryAt(2))
    await mirror.folder.write('autosave', saveAt(3), entryAt(3))
    await mirror.folder.write('slot-4', saveAt(1), entryAt(1))
    expect(await folder.list()).toEqual([
      { slot: 'autosave', entry: entryAt(3) },
      { slot: 'slot-2', entry: entryAt(1) },
      { slot: 'slot-4', entry: entryAt(1) },
    ])
  })

  it('keeps a save that only the mirror took, and resumes it', async () => {
    const { mirror, folder } = mirroredPair({ isPrimaryFull: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await folder.write('autosave', saveAt(6), entryAt(6))
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
    expect(mirror.items.get(`${FOLDER}/autosave.json`)).toBe(saveAt(6))
    expect(await folder.read('autosave')).toBe(saveAt(6))
  })

  it('fails the write with the primary store error when neither store took it', async () => {
    const { folder } = mirroredPair({ isPrimaryFull: true, isMirrorFull: true })
    await expect(folder.write('autosave', saveAt(1), entryAt(1))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    })
  })

  it('sets a refused save aside in both stores, so neither copy is resumed or overwritten', async () => {
    const { primary, mirror, folder } = mirroredPair()
    await folder.write('autosave', saveAt(9), entryAt(9))
    await folder.setAside('autosave')
    for (const store of [primary, mirror]) {
      expect(store.items.get(`${FOLDER}/autosave.refused.json`)).toBe(saveAt(9))
      expect(store.items.has(`${FOLDER}/autosave.json`)).toBe(false)
    }
    expect(await folder.read('autosave')).toBeNull()
  })

  it('removes a slot from both stores', async () => {
    const { folder } = mirroredPair()
    await folder.write('slot-1', saveAt(1), entryAt(1))
    await folder.remove('slot-1')
    expect(await folder.read('slot-1')).toBeNull()
    expect(await folder.list()).toEqual([])
  })
})
