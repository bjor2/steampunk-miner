/**
 * The debug API's `saves` namespace (#401, ticket 404): the slot index as the menus read it,
 * whole entries with the exact playtime tick and wall time, so a spec can check a pause-menu save
 * landed with the right metadata. An unlogged read: no command, never `debugApplied`.
 */
import { listSaveSlots } from '../store/checkpoint'
import type { SaveSlotEntry } from '../systems/save/saveSlotIndex'
import type { DebugResult } from './debugScreens'

export interface DebugSaves {
  /** Every slot holding a save, autosave first, once the writes queued so far have landed. */
  list(): Promise<DebugResult<{ entries: SaveSlotEntry[] }>>
}

export function createDebugSaves(): DebugSaves {
  return { list: async () => ({ ok: true, entries: await listSaveSlots() }) }
}
