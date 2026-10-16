/**
 * What the checkpoint logs about the save folder (#26, #123, #470 P1-8): a slot save once the
 * shell has it, a save no store took, a save handed to the player as a file and a file brought in.
 * Each line carries the save's epoch and bytes, so a lost or moved save can be traced in the log.
 */
import { getRunLog } from '../logging/runLog'
import type { RunEventPlace } from '../logging/runEvent'
import { stateDigest } from '../systems/authority/stateDigest'
import type { SaveMigration } from '../systems/save/saveMigrations'
import type { SaveFailureCause } from '../systems/save/saveWriteFailure'
import type { SaveSlotKey } from '../systems/save/saveSlotIndex'
import { readAuthorityState } from './authorityLink'

/** A save's exact text and the slot and epoch it was written under. */
export interface SavedText {
  slot: SaveSlotKey
  json: string
  saveEpoch: number
}

/** One slot write as the checkpoint queued it: the exact text and the facts its lines carry. */
export interface SlotSave extends SavedText {
  entryJson: string
  tick: number
  digest: string
}

/** The resumed save as its `checkpoint_loaded` names it. */
export interface LoadedCheckpoint {
  slot: string
  saveEpoch: number
  migrations: readonly SaveMigration[]
}

/**
 * Logged by the store once the resumed session is connected: the old session's open drill spans
 * (ticket 420), each migration step, then the load, with the digest of the session now.
 */
export function recordCheckpointLoaded(place: RunEventPlace, checkpoint: LoadedCheckpoint): void {
  const state = readAuthorityState()
  const at = { ...place, tick: state.tick }
  getRunLog().flushDrillSpans()
  checkpoint.migrations.forEach((step) => getRunLog().record(at, 'save_migrated', { ...step }))
  getRunLog().record(at, 'checkpoint_loaded', {
    slot: checkpoint.slot,
    epoch: checkpoint.saveEpoch,
    digest: stateDigest(state),
  })
}

/** `snapshotFile` is the debug run's copy of the save; a played run keeps none. */
export function recordCheckpointSaved(
  save: SlotSave,
  place: RunEventPlace,
  snapshotFile: string | null,
): void {
  getRunLog().record({ ...place, tick: save.tick }, 'checkpoint_saved', {
    slot: save.slot,
    epoch: save.saveEpoch,
    bytes: bytesOf(save.json),
    digest: save.digest,
    ...(snapshotFile === null ? {} : { file: snapshotFile }),
  })
}

export function recordCheckpointFailed(
  save: SlotSave,
  place: RunEventPlace,
  cause: SaveFailureCause,
): void {
  getRunLog().record({ ...place, tick: save.tick }, 'checkpoint_failed', {
    slot: save.slot,
    epoch: save.saveEpoch,
    bytes: bytesOf(save.json),
    digest: save.digest,
    cause,
  })
}

/** Stamped at the session's tick now: the export happens later than the save it hands out. */
export function recordSaveExported(save: SavedText, place: RunEventPlace, tick: number): void {
  getRunLog().record({ ...place, tick }, 'save_exported', {
    slot: save.slot,
    epoch: save.saveEpoch,
    bytes: bytesOf(save.json),
  })
}

export function recordSaveImported(save: SlotSave, place: RunEventPlace): void {
  getRunLog().record({ ...place, tick: save.tick }, 'save_imported', {
    epoch: save.saveEpoch,
    bytes: bytesOf(save.json),
    digest: save.digest,
  })
}

/** UTF-8 bytes, as the shell stores them. */
function bytesOf(json: string): number {
  return new TextEncoder().encode(json).length
}
