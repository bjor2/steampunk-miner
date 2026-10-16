/**
 * The checkpoint's write queue (#26, #401, #470 P1-8): slot writes and deletes run one after
 * another, so files land in epoch order, and each write's end is reported. A write a store took
 * logs `checkpoint_saved` (a debug run keeps its copy first, #123); a write no store took logs
 * `checkpoint_failed` and leaves the session as it was. Either way the store's follower hears it,
 * so "progress not saved" shows until the next write lands. Only `checkpoint.ts` queues here.
 */
import type { RunEventPlace } from '../logging/runEvent'
import type { SaveSlotKey } from '../systems/save/saveSlotIndex'
import { saveFailureCauseOf, type SaveFailureCause } from '../systems/save/saveWriteFailure'
import { recordCheckpointFailed, recordCheckpointSaved, type SlotSave } from './checkpointLines'
import { keepSlotSaveSnapshot } from './runSnapshots'
import type { SaveFolder } from './saveFolder'

/** The folder the queue writes, and the ask made once, as the first save is queued. */
export interface SlotWriteTarget {
  folder: SaveFolder
  /** Keep the folder from eviction (the shell's `storage.persist()`); the answer is not awaited. */
  askToKeepSaves?: () => void
}

/** How a queued slot write ended: `failure` is null once a store took it. */
export interface SaveWriteOutcome {
  slot: SaveSlotKey
  saveEpoch: number
  failure: SaveFailureCause | null
}

let writes: Promise<void> = Promise.resolve()
let isKeepAsked = false
let followWrites: (outcome: SaveWriteOutcome) => void = () => undefined

/** A new folder: nothing queued, and the first save asks to keep it again. */
export function resetSlotWrites(): void {
  writes = Promise.resolve()
  isKeepAsked = false
}

/** The store's: told how every queued slot write ended. */
export function followSaveWrites(listener: (outcome: SaveWriteOutcome) => void): void {
  followWrites = listener
}

/** Settles when every write and delete queued so far is done, or has failed and been reported. */
export function slotWritesSettled(): Promise<void> {
  return writes
}

/** After `after` (the folder's layout move) and every write queued before it. */
export function queueSlotWrite(
  target: SlotWriteTarget,
  save: SlotSave,
  place: RunEventPlace,
  after: Promise<unknown>,
): void {
  askToKeepSavesOnce(target)
  writes = writes
    .then(() => after)
    .then(() => target.folder.write(save.slot, save.json, save.entryJson))
    .then(
      () => noteSaveLanded(save, place),
      (error: unknown) => noteSaveFailed(save, place, error),
    )
    .catch((error) => console.error('checkpoint write failed', error))
}

export function queueSlotDelete(folder: SaveFolder, slot: SaveSlotKey): Promise<void> {
  writes = writes
    .then(() => folder.remove(slot))
    .catch((error) => console.error('save slot delete failed', error))
  return writes
}

function askToKeepSavesOnce(target: SlotWriteTarget): void {
  if (isKeepAsked) return
  isKeepAsked = true
  target.askToKeepSaves?.()
}

async function noteSaveLanded(save: SlotSave, place: RunEventPlace): Promise<void> {
  followWrites({ slot: save.slot, saveEpoch: save.saveEpoch, failure: null })
  const snapshotFile = await keepSlotSaveSnapshot(save.tick, save.json)
  recordCheckpointSaved(save, place, snapshotFile)
}

/** The session is untouched: the save stays in memory, and the next write may land. */
function noteSaveFailed(save: SlotSave, place: RunEventPlace, error: unknown): void {
  console.error('checkpoint write failed', error)
  const cause = saveFailureCauseOf(error)
  recordCheckpointFailed(save, place, cause)
  followWrites({ slot: save.slot, saveEpoch: save.saveEpoch, failure: cause })
}
