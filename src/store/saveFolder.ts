/**
 * The shell's save folder as the store reads it (#401): one file per slot (#12) with the slot's
 * index entry kept beside it, on localStorage in a browser and as files under Electron. Tests pass
 * a memory copy. Only `checkpoint.ts` writes through it.
 *
 * The v1 layout had one slot, `slot-1`, holding the checkpoint. On first use the folder is moved
 * to the v2 layout: a v1 file in `slot-1` moves as it is into the autosave slot, which must be
 * empty, and loads through the migration chain from there (format 1 -> 2 is its last step). A
 * `slot-1` this build cannot read is left where it is, never overwritten or dropped.
 */
import {
  AUTOSAVE_SLOT,
  inSlotOrder,
  isSaveSlotKey,
  readSlotEntry,
  slotEntryOfFile,
  V1_CHECKPOINT_SLOT,
  type SaveSlotEntry,
  type SaveSlotKey,
} from '../systems/save/saveSlotIndex'

/** A slot file the folder holds, with its kept entry's text (null when it has none). */
export interface StoredSaveSlot {
  slot: string
  entry: string | null
}

export interface SaveFolder {
  list(): Promise<StoredSaveSlot[]>
  /** The slot's text, or null when it holds no save. */
  read(slot: SaveSlotKey): Promise<string | null>
  /** Replaces the slot's file atomically, then its entry. */
  write(slot: SaveSlotKey, json: string, entryJson: string): Promise<void>
  /** Removes the slot's file and its entry; nothing when the slot is empty. */
  remove(slot: SaveSlotKey): Promise<void>
  /** Moves a save this build refused, and drops its entry, so no write can overwrite it. */
  setAside(slot: SaveSlotKey): Promise<void>
}

/** Every slot's entry in slot order; a lost or unreadable entry is read off its file again. */
export async function readSlotEntries(folder: SaveFolder): Promise<SaveSlotEntry[]> {
  const stored = await folder.list()
  const entries = await Promise.all(stored.map((slot) => entryOfStoredSlot(folder, slot)))
  return inSlotOrder(entries.filter((entry): entry is SaveSlotEntry => entry !== null))
}

async function entryOfStoredSlot(
  folder: SaveFolder,
  stored: StoredSaveSlot,
): Promise<SaveSlotEntry | null> {
  if (!isSaveSlotKey(stored.slot)) return null
  const kept = readSlotEntry(parsedJson(stored.entry))
  if (kept !== null) return { ...kept, slot: stored.slot }
  return slotEntryOfFile(stored.slot, parsedJson(await folder.read(stored.slot)))
}

/** Moves a v1 checkpoint into the empty autosave slot; true when it moved. */
export async function adoptV1SlotLayout(folder: SaveFolder): Promise<boolean> {
  const checkpoint = await v1CheckpointToMove(folder)
  if (checkpoint === null) return false
  await folder.write(AUTOSAVE_SLOT, checkpoint.text, JSON.stringify(checkpoint.entry))
  await folder.remove(V1_CHECKPOINT_SLOT)
  return true
}

/** `slot-1`'s text and autosave entry when it holds a v1 file and the autosave is empty. */
async function v1CheckpointToMove(
  folder: SaveFolder,
): Promise<{ text: string; entry: SaveSlotEntry } | null> {
  const text = await folder.read(V1_CHECKPOINT_SLOT)
  const entry = slotEntryOfFile(AUTOSAVE_SLOT, parsedJson(text))
  const isV1Checkpoint = text !== null && entry?.formatVersion === 1
  if (!isV1Checkpoint || (await folder.read(AUTOSAVE_SLOT)) !== null) return null
  return { text, entry }
}

/** The parsed text, or undefined for no text or text that is not JSON. */
export function parsedJson(text: string | null): unknown {
  if (text === null) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
