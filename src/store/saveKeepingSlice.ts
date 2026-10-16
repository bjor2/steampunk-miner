/**
 * The game store's save-keeping slice (#470 P1-8, ticket 479): whether the session's progress is
 * unsaved, and the player's export and import of a save file. A slot write no store took sets
 * `unsavedProgress`, which the "progress not saved" chip shows until the next write lands. Export
 * hands the session's last save to the player byte for byte (a download, or the share sheet on a
 * phone); Import picks a file, which the checkpoint checks through the migration chain, writes into
 * the autosave and resumes. The checkpoint stays the one writer of the save folder; the shell's
 * file hand-over and picker come in through `installSaveTransfer`. As the page hides, the
 * autosave is written again only while docked, never behind the title menu.
 *
 * Nothing here is authority state, a command or part of the digest.
 */
import type { RunEventPlace } from '../logging/runEvent'
import type { SaveFailureCause } from '../systems/save/saveWriteFailure'
import type { SaveSlotKey } from '../systems/save/saveSlotIndex'
import type { TitleMenu } from '../systems/views/titleMenuModel'
import { readAuthorityState } from './authorityLink'
import {
  importSaveText,
  saveToExport,
  writeCheckpointWhileDocked,
  type Checkpoint,
  type SaveWriteOutcome,
} from './checkpoint'
import { recordSaveExported } from './checkpointLines'

/** The shell's side of a save file: hand one to the player, or let them pick one. */
export interface SaveTransfer {
  handOverSaveFile(fileName: string, json: string): Promise<void>
  /** The picked file's text; null when the player picked none. */
  pickSaveFile(): Promise<string | null>
}

/** The write that left the session unsaved. */
export interface UnsavedProgress {
  slot: SaveSlotKey
  saveEpoch: number
  cause: SaveFailureCause
}

export interface SaveKeepingValues {
  /** Set by a slot write no store took; null once a write lands. */
  unsavedProgress: UnsavedProgress | null
  /** Why the last export or import was refused; [] after one that worked. */
  saveTransferProblems: readonly string[]
}

export interface SaveKeepingActions {
  /** The checkpoint's report of a queued write's end. */
  noteSaveWrite(outcome: SaveWriteOutcome): void
  /** Hands the session's last save to the player as a file. */
  exportSave(): void
  /** Lets the player pick a save file and imports it; settles once it is resumed or refused. */
  importSave(): Promise<void>
  /** The picked file's text: resumed on success, else the problems; what the debug API calls. */
  importSaveFromText(text: string): string[]
  /** The page is hiding: the autosave again while docked (#470 P1-8). */
  writeCheckpointOnPageHide(): void
}

type SliceHost = SaveKeepingValues &
  SaveKeepingActions & {
    playerId: string
    planetTier: number
    depthTiles: number
    titleMenu: TitleMenu | null
    resumeCheckpoint(checkpoint: Checkpoint): void
    closeSettings(): void
    closePauseMenu(): void
  }

type SetSlice = (partial: Partial<SaveKeepingValues>) => void

export const STARTING_SAVE_KEEPING: SaveKeepingValues = {
  unsavedProgress: null,
  saveTransferProblems: [],
}

const NOTHING_TO_EXPORT = 'nothing is saved yet: the game saves at the dock'
const NO_FILE_TRANSFER = 'this run cannot hand files over'

let transfer: SaveTransfer | null = null

/** The composition root's shell; tests pass their own, and null leaves files untouched. */
export function installSaveTransfer(next: SaveTransfer | null): void {
  transfer = next
}

export function saveKeepingActionsOf(set: SetSlice, get: () => SliceHost): SaveKeepingActions {
  return {
    noteSaveWrite: (outcome) => set({ unsavedProgress: unsavedProgressOf(outcome) }),
    exportSave: () => set({ saveTransferProblems: handOverLastSave(get()) }),
    importSave: async () => {
      if (transfer === null) return set({ saveTransferProblems: [NO_FILE_TRANSFER] })
      const text = await transfer.pickSaveFile()
      if (text !== null) get().importSaveFromText(text)
    },
    importSaveFromText: (text) => {
      const problems = resumeOrRefuseImport(get(), text)
      set({ saveTransferProblems: problems })
      return problems
    },
    writeCheckpointOnPageHide: () => {
      if (get().titleMenu === null) writeCheckpointWhileDocked(runEventPlaceOf(get()))
    },
  }
}

function unsavedProgressOf(outcome: SaveWriteOutcome): UnsavedProgress | null {
  if (outcome.failure === null) return null
  return { slot: outcome.slot, saveEpoch: outcome.saveEpoch, cause: outcome.failure }
}

/** The problems that kept the file from the player; [] once it is handed over. */
function handOverLastSave(host: SliceHost): string[] {
  const save = saveToExport()
  if (transfer === null) return [NO_FILE_TRANSFER]
  if (save === null) return [NOTHING_TO_EXPORT]
  void transfer
    .handOverSaveFile(save.fileName, save.json)
    .catch((error) => console.error('save export failed', error))
  recordSaveExported(save, runEventPlaceOf(host), readAuthorityState().tick)
  return []
}

function resumeOrRefuseImport(host: SliceHost, text: string): string[] {
  const imported = importSaveText(text, runEventPlaceOf(host))
  if ('problems' in imported) return imported.problems
  resumeImportedSave(host, imported)
  return []
}

/** The game goes on from the imported save, out of the menus it was imported from. */
function resumeImportedSave(host: SliceHost, checkpoint: Checkpoint): void {
  host.resumeCheckpoint(checkpoint)
  host.closeSettings()
  host.closePauseMenu()
}

function runEventPlaceOf(host: SliceHost): RunEventPlace {
  return { playerId: host.playerId, planet: host.planetTier, depthTiles: host.depthTiles }
}
