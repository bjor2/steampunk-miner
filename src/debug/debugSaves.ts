/**
 * The debug API's `saves` namespace (#401, ticket 404): the slot index as the menus read it,
 * whole entries with the exact playtime tick and wall time, so a spec can check a pause-menu save
 * landed with the right metadata. An unlogged read: no command, never `debugApplied`.
 *
 * Save keeping (#470 P1-8, ticket 479): the exact text Export hands over (an unlogged read), the
 * Export press itself, and Import with a text in place of a picked file, since a file picker only
 * opens from a real tap. The import logs `debug_command_applied` before the import's own lines,
 * so it never counts as play; it submits no command, so the resumed digest is the file's.
 */
import { getRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { listSaveSlots, saveToExport } from '../store/checkpoint'
import { runEventPlaceOf, useGameStore } from '../store/gameStore'
import type { SaveSlotEntry } from '../systems/save/saveSlotIndex'
import type { DebugResult } from './debugScreens'

export interface DebugSaves {
  /** Every slot holding a save, autosave first, once the writes queued so far have landed. */
  list(): Promise<DebugResult<{ entries: SaveSlotEntry[] }>>
  /** What Export would hand over now: the session's last save, byte for byte. */
  exportText(): DebugResult<{ fileName: string; json: string }>
  /** Presses Export: the shell hands the file over (a download in a desktop browser). */
  exportFile(): DebugResult
  /** Imports `json` as a picked file would be: resumed, or refused with its problems. */
  importText(json: string): DebugResult
}

export function createDebugSaves(): DebugSaves {
  return {
    list: async () => ({ ok: true, entries: await listSaveSlots() }),
    exportText: () => {
      const save = saveToExport()
      if (save === null) return { ok: false, problems: ['nothing is saved yet'] }
      return { ok: true, fileName: save.fileName, json: save.json }
    },
    exportFile: () => {
      useGameStore.getState().exportSave()
      return resultOf(useGameStore.getState().saveTransferProblems)
    },
    importText: (json) => {
      recordImportCommand(json)
      return resultOf(useGameStore.getState().importSaveFromText(json))
    },
  }
}

function recordImportCommand(json: string): void {
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: readAuthorityState().tick }
  getRunLog().record(stamp, 'debug_command_applied', {
    command: 'saves.importText',
    args: { chars: json.length },
  })
}

function resultOf(problems: readonly string[]): DebugResult {
  return problems.length === 0 ? { ok: true } : { ok: false, problems: [...problems] }
}
