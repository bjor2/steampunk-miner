import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from './memoryStorage'
import { createStoredSaveFolder } from './storedSaveSlots'

const FOLDER = 'steampunk-miner/saves'

function folderOnMemory() {
  const storage = createMemoryStorage()
  return { items: storage.items, folder: createStoredSaveFolder(storage, FOLDER) }
}

describe('browser save folder', () => {
  it('writes a slot and its entry under the folder, as Electron names its files', () => {
    const { items, folder } = folderOnMemory()
    folder.write('slot-2', '{"save":2}', '{"entry":2}')
    expect(items.get(`${FOLDER}/slot-2.json`)).toBe('{"save":2}')
    expect(items.get(`${FOLDER}/slot-2.entry.json`)).toBe('{"entry":2}')
    expect(folder.read('slot-2')).toBe('{"save":2}')
    expect(folder.read('slot-3')).toBeNull()
  })

  it('lists every slot holding a save with its entry, and nothing else in storage', () => {
    const { items, folder } = folderOnMemory()
    folder.write('autosave', '{}', '{"entry":"a"}')
    folder.write('slot-1', '{}', '{"entry":1}')
    items.set(`${FOLDER}/slot-1.refused.json`, '{}')
    items.set('steampunk-miner/saves-debug/slot-4.json', '{}')
    items.set('steampunk-miner/preferences.json', '{}')
    items.set(`${FOLDER}/slot-5.json`, '{}')
    expect(folder.list()).toEqual([
      { slot: 'autosave', entry: '{"entry":"a"}' },
      { slot: 'slot-1', entry: '{"entry":1}' },
      { slot: 'slot-5', entry: null },
    ])
  })

  it('removes a slot together with its entry', () => {
    const { items, folder } = folderOnMemory()
    folder.write('slot-3', '{}', '{}')
    folder.remove('slot-3')
    expect([...items.keys()]).toEqual([])
    expect(folder.list()).toEqual([])
  })

  it('sets a refused save aside under its own name and drops its entry', () => {
    const { items, folder } = folderOnMemory()
    folder.write('autosave', '{"refused":true}', '{}')
    folder.setAside('autosave')
    expect([...items.entries()]).toEqual([[`${FOLDER}/autosave.refused.json`, '{"refused":true}']])
  })
})
