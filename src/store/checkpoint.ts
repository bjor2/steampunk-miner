/**
 * The one writer of the checkpoint save (#2 done item 7, #12, #26). After each command's events
 * the store asks `writeCheckpointAfter`; at a checkpoint moment (a dock, a tow, travel, a purchase
 * at the dock) the session is cut into a save slot with the next `saveEpoch` and handed to the
 * shell, which writes it atomically. Writes are queued, so slot files land in epoch order.
 * `checkpoint_saved` is logged once the shell has the file.
 *
 * At start `loadCheckpoint` reads the slot back: a save this build refuses is set aside, never
 * overwritten, and the run starts fresh with the problems on the console.
 */
import { getRunLog } from '../logging/runLog'
import type { RunEventPlace } from '../logging/runEvent'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { takeSnapshot } from '../systems/authority/sessionSnapshot'
import { stateDigest } from '../systems/authority/stateDigest'
import { isCheckpointMoment } from '../systems/save/checkpointMoment'
import {
  CHECKPOINT_SLOT,
  readSaveSlot,
  saveSlotOf,
  type SaveSlotFile,
  type SaveSlotReading,
} from '../systems/save/saveSlot'
import { readAuthorityState } from './authorityLink'

/** The shell's save files, as the checkpoint needs them; tests pass a memory copy. */
export interface SaveSlots {
  write(slot: number, json: string): Promise<void>
  read(slot: number): Promise<string | null>
  setAside(slot: number): Promise<void>
}

export interface Checkpoint {
  state: AuthorityState
  saveEpoch: number
}

/** What a start finds in the slot: a session to resume, a refused save, or nothing. */
export type CheckpointLoad = Checkpoint | { problems: string[] } | null

let slots: SaveSlots | null = null
let lastEpoch = 0
let writes: Promise<void> = Promise.resolve()

/** Before this (and in tests that do not care) nothing is written. */
export function installSaveSlots(next: SaveSlots | null): void {
  slots = next
  lastEpoch = 0
  writes = Promise.resolve()
}

export function writeCheckpointAfter(events: readonly DomainEvent[], place: RunEventPlace): void {
  if (slots === null || !isCheckpointMoment(events)) return
  queueWrite(slots, nextSaveSlot(), place)
}

function nextSaveSlot(): SaveSlotFile {
  lastEpoch += 1
  return saveSlotOf(takeSnapshot(readAuthorityState()), lastEpoch)
}

/** Settles when every checkpoint queued so far is written (or has failed and been reported). */
export function checkpointWrites(): Promise<void> {
  return writes
}

/** The saved session, null when there is none to resume, or the problems that refused it. */
export async function loadCheckpoint(): Promise<CheckpointLoad> {
  if (slots === null) return null
  const text = await slots.read(CHECKPOINT_SLOT)
  return text === null ? null : adoptOrSetAside(slots, readSaveSlotText(text))
}

/** A resumed session's next checkpoint carries the next epoch; a refused save is kept aside. */
async function adoptOrSetAside(
  target: SaveSlots,
  reading: SaveSlotReading,
): Promise<Checkpoint | { problems: string[] }> {
  if ('state' in reading) {
    lastEpoch = reading.saveEpoch
    return reading
  }
  await target.setAside(CHECKPOINT_SLOT)
  return reading
}

/** Logged by the store once the resumed session is connected. */
export function recordCheckpointLoaded(place: RunEventPlace, epoch: number): void {
  const state = readAuthorityState()
  getRunLog().record({ ...place, tick: state.tick }, 'checkpoint_loaded', {
    slot: slotName(),
    epoch,
    digest: stateDigest(state),
  })
}

/** The slot's name in `checkpoint_saved` and `checkpoint_loaded`. */
function slotName(): string {
  return `slot-${CHECKPOINT_SLOT}`
}

function readSaveSlotText(text: string): SaveSlotReading {
  try {
    return readSaveSlot(JSON.parse(text))
  } catch {
    return { problems: ['save is not JSON'] }
  }
}

function queueWrite(target: SaveSlots, file: SaveSlotFile, place: RunEventPlace): void {
  const json = JSON.stringify(file)
  writes = writes
    .then(() => target.write(CHECKPOINT_SLOT, json))
    .then(() => recordCheckpointSaved(file, json, place))
    .catch((error) => console.error('checkpoint write failed', error))
}

function recordCheckpointSaved(file: SaveSlotFile, json: string, place: RunEventPlace): void {
  getRunLog().record({ ...place, tick: file.tick }, 'checkpoint_saved', {
    slot: slotName(),
    epoch: file.saveEpoch,
    bytes: new TextEncoder().encode(json).length,
    digest: file.digest,
  })
}
