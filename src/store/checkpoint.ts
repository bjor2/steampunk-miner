/**
 * The one writer of the save folder (#2 done item 7, #12, #26, #401). After each command's events
 * the store asks `writeCheckpointAfter`; at a checkpoint moment (a dock, a tow, travel, a purchase
 * at the dock) the session is cut into a save with the next `saveEpoch` and written into the
 * autosave slot. The player writes a named manual slot with `saveToManualSlot`. Writes and
 * deletes are queued, so files land in epoch order. `checkpoint_saved` is logged once the shell
 * has the file.
 *
 * At start `loadCheckpoint` reads the autosave back through the migration chain (#170); a save of
 * an older build loads through its steps, each logged as `save_migrated` before
 * `checkpoint_loaded`; a save this build refuses is set aside, never overwritten, and the run
 * starts fresh with the problems on the console. `loadSaveSlot` does the same for any slot, and
 * the index (`listSaveSlots`, `latestSaveSlot`, `deleteSaveSlot`) answers the slot menus. The
 * folder is moved to the v2 slot layout before any of them reads it (`saveFolder.ts`).
 *
 * A debug run also keeps each slot save as a snapshot file (#123), which `checkpoint_saved` names.
 */
import { getRunLog } from '../logging/runLog'
import type { RunEventPlace } from '../logging/runEvent'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { takeSnapshot } from '../systems/authority/sessionSnapshot'
import { stateDigest } from '../systems/authority/stateDigest'
import { isCheckpointMoment } from '../systems/save/checkpointMoment'
import {
  readMigratedSaveSlot,
  type MigratedSaveSlotReading,
  type SaveMigration,
} from '../systems/save/saveMigrations'
import { saveSlotOf, type SaveSlotFile } from '../systems/save/saveSlot'
import {
  AUTOSAVE_NAME,
  AUTOSAVE_SLOT,
  isManualSlotKey,
  latestSlotOf,
  slotEntryOf,
  type SaveSlotEntry,
  type SaveSlotKey,
  type SaveSlotMeta,
} from '../systems/save/saveSlotIndex'
import { readAuthorityState } from './authorityLink'
import { keepSlotSaveSnapshot } from './runSnapshots'
import { adoptV1SlotLayout, parsedJson, readSlotEntries, type SaveFolder } from './saveFolder'

/** The folder and the wall clock its saves are stamped with (the shell's; tests pass their own). */
export interface SaveFolderInstall {
  folder: SaveFolder
  readWallClockMs: () => number
}

export interface Checkpoint {
  slot: SaveSlotKey
  state: AuthorityState
  saveEpoch: number
  /** The open unlock ids the save shows (`savedUnlocks.ts`, #401). */
  unlocked: readonly string[]
  /** The chain's steps that brought an older save up to this build, in order. */
  migrations: readonly SaveMigration[]
}

/** What a start finds in a slot: a session to resume, a refused save, or nothing. */
export type CheckpointLoad = Checkpoint | { problems: string[] } | null

let installed: SaveFolderInstall | null = null
let lastEpoch = 0
let writes: Promise<void> = Promise.resolve()
let layoutAdopted: Promise<boolean> = Promise.resolve(false)

/** Before this (and in tests that do not care) nothing is written. */
export function installSaveFolder(next: SaveFolderInstall | null): void {
  installed = next
  lastEpoch = 0
  writes = Promise.resolve()
  layoutAdopted = next === null ? Promise.resolve(false) : adoptLayoutOrReport(next.folder)
}

/** A layout that fails to move leaves the v1 file where it is; the autosave still writes. */
function adoptLayoutOrReport(folder: SaveFolder): Promise<boolean> {
  return adoptV1SlotLayout(folder).catch((error) => {
    console.error('save slot layout not adopted', error)
    return false
  })
}

export function writeCheckpointAfter(events: readonly DomainEvent[], place: RunEventPlace): void {
  if (installed === null || !isCheckpointMoment(events)) return
  queueWrite(installed, AUTOSAVE_SLOT, nextSaveFile(installed, AUTOSAVE_NAME), place)
}

/** The player's save into a manual slot under `name`; an existing save there is replaced. */
export function saveToManualSlot(slot: SaveSlotKey, name: string, place: RunEventPlace): string[] {
  const problems = manualSaveProblems(slot)
  if (installed === null || problems.length > 0) return problems
  queueWrite(installed, slot, nextSaveFile(installed, name), place)
  return []
}

/** The autosave is the checkpoint's alone. */
function manualSaveProblems(slot: SaveSlotKey): string[] {
  if (installed === null) return ['this run has no save folder']
  return isManualSlotKey(slot) ? [] : [`${slot} is not a manual slot`]
}

function nextSaveFile(target: SaveFolderInstall, name: string): SaveSlotFile {
  lastEpoch += 1
  const slot: SaveSlotMeta = { name, savedAtMs: target.readWallClockMs() }
  return saveSlotOf(takeSnapshot(readAuthorityState()), lastEpoch, slot)
}

/**
 * The session as a save file now, under the last slot save's epoch: what a debug run's timed and
 * session-end snapshots keep (#123). No slot is written and the epoch does not advance.
 */
export function saveFileNow(): SaveSlotFile {
  const slot: SaveSlotMeta = {
    name: AUTOSAVE_NAME,
    savedAtMs: installed?.readWallClockMs() ?? null,
  }
  return saveSlotOf(takeSnapshot(readAuthorityState()), lastEpoch, slot)
}

/** Settles when every save write and delete queued so far is done (or has failed and been reported). */
export function checkpointWrites(): Promise<void> {
  return writes
}

/** Every slot holding a save, autosave first, once the writes queued so far have landed. */
export async function listSaveSlots(): Promise<SaveSlotEntry[]> {
  if (installed === null) return []
  return readSlotEntries(await settledFolder(installed))
}

/** The slot written last: what Continue loads. */
export async function latestSaveSlot(): Promise<SaveSlotEntry | null> {
  return latestSlotOf(await listSaveSlots())
}

/** Empties a slot, after the writes queued before it. */
export function deleteSaveSlot(slot: SaveSlotKey): Promise<void> {
  if (installed === null) return writes
  const { folder } = installed
  writes = writes
    .then(() => folder.remove(slot))
    .catch((error) => console.error('save slot delete failed', error))
  return writes
}

/** The saved session to resume at start: the autosave's. */
export function loadCheckpoint(): Promise<CheckpointLoad> {
  return loadSaveSlot(AUTOSAVE_SLOT)
}

/** The slot's session, null when it holds none, or the problems that refused it. */
export async function loadSaveSlot(slot: SaveSlotKey): Promise<CheckpointLoad> {
  if (installed === null) return null
  const folder = await settledFolder(installed)
  const text = await folder.read(slot)
  return text === null ? null : adoptOrSetAside(folder, slot, readSaveSlotText(text))
}

/** The folder once its layout is adopted and the queued writes have landed. */
async function settledFolder(target: SaveFolderInstall): Promise<SaveFolder> {
  await layoutAdopted
  await writes
  return target.folder
}

/** A resumed session's next save carries the next epoch; a refused save is kept aside. */
async function adoptOrSetAside(
  folder: SaveFolder,
  slot: SaveSlotKey,
  reading: MigratedSaveSlotReading,
): Promise<Checkpoint | { problems: string[] }> {
  if ('state' in reading) {
    lastEpoch = reading.saveEpoch
    const { state, saveEpoch, unlocked, migrations } = reading
    return { slot, state, saveEpoch, unlocked, migrations }
  }
  await folder.setAside(slot)
  return { problems: reading.problems }
}

/** Logged by the store once the resumed session is connected: each migration step, then the load. */
export function recordCheckpointLoaded(place: RunEventPlace, checkpoint: Checkpoint): void {
  const state = readAuthorityState()
  const at = { ...place, tick: state.tick }
  checkpoint.migrations.forEach((step) => getRunLog().record(at, 'save_migrated', { ...step }))
  getRunLog().record(at, 'checkpoint_loaded', {
    slot: checkpoint.slot,
    epoch: checkpoint.saveEpoch,
    digest: stateDigest(state),
  })
}

function readSaveSlotText(text: string): MigratedSaveSlotReading {
  const parsed = parsedJson(text)
  if (parsed === undefined) return { problems: ['save is not JSON'], migrations: [] }
  return readMigratedSaveSlot(parsed)
}

function queueWrite(
  target: SaveFolderInstall,
  slot: SaveSlotKey,
  file: SaveSlotFile,
  place: RunEventPlace,
): void {
  const json = JSON.stringify(file)
  const entryJson = JSON.stringify(slotEntryOf(slot, file))
  writes = writes
    .then(() => layoutAdopted)
    .then(() => target.folder.write(slot, json, entryJson))
    .then(() => keepSlotSaveSnapshot(file.tick, json))
    .then((snapshotFile) => recordCheckpointSaved(slot, file, json, place, snapshotFile))
    .catch((error) => console.error('checkpoint write failed', error))
}

/** `snapshotFile` is the debug run's copy of the save; a played run keeps none. */
function recordCheckpointSaved(
  slot: SaveSlotKey,
  file: SaveSlotFile,
  json: string,
  place: RunEventPlace,
  snapshotFile: string | null,
): void {
  getRunLog().record({ ...place, tick: file.tick }, 'checkpoint_saved', {
    slot,
    epoch: file.saveEpoch,
    bytes: new TextEncoder().encode(json).length,
    digest: file.digest,
    ...(snapshotFile === null ? {} : { file: snapshotFile }),
  })
}
