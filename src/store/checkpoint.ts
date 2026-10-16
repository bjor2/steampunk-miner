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
 * The host owns the world save (ticket 407): a player who joins a host's world resumes the host's
 * save (`joinHostWorld`) as a guest, and while a guest neither the checkpoint nor a manual save
 * writes anything. Loading one of their own slots makes them the host of that world again.
 *
 * A debug run also keeps each slot save as a snapshot file (#123), which `checkpoint_saved` names.
 *
 * Durability on phones (#470 P1-8, ticket 479): a write no store took is logged as
 * `checkpoint_failed` and handed to the store (`followSaveWrites`), which shows "progress not
 * saved" until the next write lands; the first save asks the browser to keep the folder from
 * eviction. The session's last save, written, failed, loaded or imported, is the one Export hands
 * over (`saveToExport`), byte for byte; Import (`importSaveText`) checks a file through the
 * migration chain, writes its exact text into the autosave and resumes it. A hidden page writes
 * the autosave only while the vehicle is docked (`writeCheckpointWhileDocked`): a trip resumes at
 * the dock, never mid-trip, until that is ruled.
 */
import type { RunEventPlace } from '../logging/runEvent'
import { vehicleOf, type AuthorityState } from '../systems/authority/authorityState'
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
  slotEntryOfFile,
  type SaveSlotEntry,
  type SaveSlotKey,
  type SaveSlotMeta,
} from '../systems/save/saveSlotIndex'
import {
  canWriteWorldSave,
  HOST_WORLD_SAVE,
  worldSaveWriteProblems,
  type SaveRole,
} from '../systems/save/worldSaveOwnership'
import { readAuthorityState } from './authorityLink'
import { recordSaveImported, type SavedText, type SlotSave } from './checkpointLines'

export { recordCheckpointLoaded } from './checkpointLines'
import { adoptV1SlotLayout, parsedJson, readSlotEntries, type SaveFolder } from './saveFolder'
import {
  queueSlotDelete,
  queueSlotWrite,
  resetSlotWrites,
  slotWritesSettled,
  type SlotWriteTarget,
} from './slotWriteQueue'

export { followSaveWrites, type SaveWriteOutcome } from './slotWriteQueue'

/** The folder and the wall clock its saves are stamped with (the shell's; tests pass their own). */
export interface SaveFolderInstall extends SlotWriteTarget {
  readWallClockMs: () => number
}

/** The session's last save as Export hands it over: its exact text under a file name. */
export interface SaveExport extends SavedText {
  fileName: string
}

export interface Checkpoint {
  /** The player's slot, or the host's save for a joined world. */
  slot: SaveSlotKey | typeof HOST_WORLD_SAVE
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
let layoutAdopted: Promise<boolean> = Promise.resolve(false)
let role: SaveRole = 'host'
let lastSave: SavedText | null = null

/** Before this (and in tests that do not care) nothing is written. */
export function installSaveFolder(next: SaveFolderInstall | null): void {
  installed = next
  lastEpoch = 0
  role = 'host'
  lastSave = null
  resetSlotWrites()
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
  if (installed === null || !isWorldSaveDue(events)) return
  queueAutosave(installed, place)
}

function isWorldSaveDue(events: readonly DomainEvent[]): boolean {
  return canWriteWorldSave(role) && isCheckpointMoment(events)
}

/**
 * As the page hides (#470 P1-8): the autosave again, only while the local vehicle is docked, where
 * every checkpoint moment happens; out on a trip nothing is written, so a resume starts docked.
 */
export function writeCheckpointWhileDocked(place: RunEventPlace): void {
  if (installed === null || !isDockedSaveDue(place.playerId)) return
  queueAutosave(installed, place)
}

function isDockedSaveDue(playerId: string): boolean {
  return canWriteWorldSave(role) && vehicleOf(readAuthorityState(), playerId).mode === 'docked'
}

function queueAutosave(target: SaveFolderInstall, place: RunEventPlace): void {
  queueWrite(target, slotSaveOf(AUTOSAVE_SLOT, nextSaveFile(target, AUTOSAVE_NAME)), place)
}

/** The player's save into a manual slot under `name`; an existing save there is replaced. */
export function saveToManualSlot(slot: SaveSlotKey, name: string, place: RunEventPlace): string[] {
  const problems = manualSaveProblems(slot)
  if (installed === null || problems.length > 0) return problems
  queueWrite(installed, slotSaveOf(slot, nextSaveFile(installed, name)), place)
  return []
}

/** The autosave is the checkpoint's alone, and a guest saves no world. */
function manualSaveProblems(slot: SaveSlotKey): string[] {
  if (installed === null) return ['this run has no save folder']
  return [...worldSaveWriteProblems(role), ...manualSlotProblems(slot)]
}

function manualSlotProblems(slot: SaveSlotKey): string[] {
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
  return slotWritesSettled()
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
  if (installed === null) return slotWritesSettled()
  return queueSlotDelete(installed.folder, slot)
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
  return text === null ? null : adoptOrSetAside(folder, { slot, text }, readSaveSlotText(text))
}

/** The save Export hands over: the last one written, tried, loaded or imported; null before any. */
export function saveToExport(): SaveExport | null {
  if (lastSave === null) return null
  return { ...lastSave, fileName: `steampunk-miner-${lastSave.slot}.json` }
}

/**
 * A save file the player brought in (ticket 479): read through the migration chain like a slot,
 * then its exact text written into the autosave and resumed, so exporting it again gives the same
 * bytes. A file this build refuses changes nothing.
 */
export function importSaveText(
  text: string,
  place: RunEventPlace,
): Checkpoint | { problems: string[] } {
  const imported = importedSaveOf(text)
  if (installed === null) return { problems: ['this run has no save folder'] }
  if ('problems' in imported) return imported
  recordSaveImported(imported.save, place)
  queueWrite(installed, imported.save, place)
  role = 'host'
  return checkpointOfReading(AUTOSAVE_SLOT, imported.reading)
}

type ResumableReading = Extract<MigratedSaveSlotReading, { state: AuthorityState }>

/** The file as the autosave's write, with the entry read off its own header. */
function importedSaveOf(
  json: string,
): { save: SlotSave; reading: ResumableReading } | { problems: string[] } {
  const reading = readSaveSlotText(json)
  if (!('state' in reading)) return { problems: reading.problems }
  const entry = slotEntryOfFile(AUTOSAVE_SLOT, parsedJson(json))
  if (entry === null) return { problems: ['the save header names no slot'] }
  const { state, saveEpoch } = reading
  const digest = stateDigest(state)
  const entryJson = JSON.stringify(entry)
  return {
    reading,
    save: { slot: AUTOSAVE_SLOT, json, entryJson, tick: state.tick, saveEpoch, digest },
  }
}

/**
 * The host's save of the world this player joins, as the host sent it: resumed like a slot, and
 * from then on this player is the host's guest and writes no world save. A save this build refuses
 * leaves them the host of their own world, with nothing set aside, since the file is not theirs.
 */
export function joinHostWorld(hostSaveText: string): Checkpoint | { problems: string[] } {
  const reading = readSaveSlotText(hostSaveText)
  if (!('state' in reading)) return { problems: reading.problems }
  role = 'guest'
  return checkpointOfReading(HOST_WORLD_SAVE, reading)
}

/** The folder once its layout is adopted and the queued writes have landed. */
async function settledFolder(target: SaveFolderInstall): Promise<SaveFolder> {
  await layoutAdopted
  await slotWritesSettled()
  return target.folder
}

/** A resumed session's next save carries the next epoch; a refused save is kept aside. */
async function adoptOrSetAside(
  folder: SaveFolder,
  stored: { slot: SaveSlotKey; text: string },
  reading: MigratedSaveSlotReading,
): Promise<Checkpoint | { problems: string[] }> {
  if ('state' in reading) {
    role = 'host'
    lastSave = { slot: stored.slot, json: stored.text, saveEpoch: reading.saveEpoch }
    return checkpointOfReading(stored.slot, reading)
  }
  await folder.setAside(stored.slot)
  return { problems: reading.problems }
}

function checkpointOfReading(slot: Checkpoint['slot'], reading: ResumableReading): Checkpoint {
  lastEpoch = reading.saveEpoch
  const { state, saveEpoch, unlocked, migrations } = reading
  return { slot, state, saveEpoch, unlocked, migrations }
}

function readSaveSlotText(text: string): MigratedSaveSlotReading {
  const parsed = parsedJson(text)
  if (parsed === undefined) return { problems: ['save is not JSON'], migrations: [] }
  return readMigratedSaveSlot(parsed)
}

function slotSaveOf(slot: SaveSlotKey, file: SaveSlotFile): SlotSave {
  const json = JSON.stringify(file)
  const entryJson = JSON.stringify(slotEntryOf(slot, file))
  return { slot, json, entryJson, tick: file.tick, saveEpoch: file.saveEpoch, digest: file.digest }
}

/** The save Export would hand over from now on, whether or not a store takes it. */
function queueWrite(target: SaveFolderInstall, save: SlotSave, place: RunEventPlace): void {
  lastSave = { slot: save.slot, json: save.json, saveEpoch: save.saveEpoch }
  queueSlotWrite(target, save, place, layoutAdopted)
}
