/**
 * The debug API's `saves` namespace (#401, ticket 404): the slot index as the menus read it, and a
 * slot loaded into the running session, so a browser spec can save from the pause menu and load
 * the slot back before the title menu's Load (#403) exists. The list is an unlogged read; a load
 * logs `debug_command_applied` before the checkpoint's own `checkpoint_loaded`, so it never
 * counts as play.
 */
import { getRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { listSaveSlots, loadSaveSlot, type CheckpointLoad } from '../store/checkpoint'
import { runEventPlaceOf, useGameStore } from '../store/gameStore'
import { isSaveSlotKey, type SaveSlotEntry, type SaveSlotKey } from '../systems/save/saveSlotIndex'
import type { DebugResult } from './debugScreens'
import { sessionPoint, type SessionPoint } from './debugLiveTime'

export interface DebugSaves {
  /** Every slot holding a save, autosave first, once the writes queued so far have landed. */
  list(): Promise<DebugResult<{ entries: SaveSlotEntry[] }>>
  /**
   * Replaces the session with a slot's save (`autosave`, `slot-1` to `slot-9`), as Continue and
   * Load resume one; refused for an empty slot or a save this build refuses (which is set aside).
   */
  load(slot: unknown): Promise<DebugResult<SessionPoint>>
}

export function createDebugSaves(): DebugSaves {
  return {
    list: async () => ({ ok: true, entries: await listSaveSlots() }),
    load: loadSlotUnlessRefused,
  }
}

async function loadSlotUnlessRefused(slot: unknown): Promise<DebugResult<SessionPoint>> {
  if (!isSaveSlotKey(slot)) return refused([`${JSON.stringify(slot)} is not a save slot`])
  const loaded = await loadSaveSlot(slot)
  if (loaded === null || !('state' in loaded)) return refused(loadProblemsOf(slot, loaded))
  recordSlotLoad(slot)
  useGameStore.getState().resumeCheckpoint(loaded)
  return { ok: true, ...sessionPoint() }
}

function loadProblemsOf(slot: SaveSlotKey, loaded: CheckpointLoad): string[] {
  return loaded !== null && 'problems' in loaded ? loaded.problems : [`${slot} holds no save`]
}

function recordSlotLoad(slot: SaveSlotKey): void {
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: readAuthorityState().tick }
  getRunLog().record(stamp, 'debug_command_applied', { command: 'loadSaveSlot', args: { slot } })
}

function refused(problems: string[]): { ok: false; problems: string[] } {
  return { ok: false, problems }
}
