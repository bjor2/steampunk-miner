/**
 * The only module that writes save files to disk (decision #12, #26, slots #401):
 *   <userData>/saves/<slot>.json             the Auto-Cloud folder
 *   <userData>/saves/<slot>.entry.json       the slot's index entry (name, planet, playtime, time)
 *   <userData>/saves-debug/...               a debug run's folder, never synced (#11 section 6)
 * A slot is `autosave` or a manual `slot-1` .. `slot-9`. A write goes to a temp file, is flushed,
 * then renamed over the slot, so a crash mid-write leaves the previous save whole; the entry is
 * written the same way after it, and the renderer rebuilds an entry it finds missing from the
 * file. A save this build refused is renamed to `<slot>.refused.json` and its entry removed, so
 * the next write never overwrites a save a later build might still read.
 * Everything arriving from the renderer is treated as untrusted: folder, slot and size are checked.
 */
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { SaveFolderName, StoredSaveSlot } from './bridgeContract.cjs'

const SAVE_FOLDERS: readonly string[] = ['saves', 'saves-debug']
const SLOT_NAME = /^(autosave|slot-[1-9])$/
const SLOT_FILE = /^(autosave|slot-[1-9])\.json$/
// A fully hollowed planet 1 is about 45 KB (#4); the cap only stops a runaway renderer.
const MAX_SAVE_BYTES = 4 * 1024 * 1024
// An entry is a name and a few numbers.
const MAX_ENTRY_BYTES = 4 * 1024

export async function writeSaveSlot(
  userData: string,
  folder: unknown,
  slot: unknown,
  json: unknown,
  entryJson: unknown,
): Promise<void> {
  const path = slotPath(userData, folder, slot)
  const text = acceptText(json, MAX_SAVE_BYTES)
  const entry = acceptText(entryJson, MAX_ENTRY_BYTES)
  await mkdir(join(userData, acceptFolder(folder)), { recursive: true })
  await replaceFlushed(path, text)
  await replaceFlushed(entryPathOf(path), entry)
}

/** The slot's text, or null when the slot is empty. */
export async function readSaveSlot(
  userData: string,
  folder: unknown,
  slot: unknown,
): Promise<string | null> {
  return readOrNull(slotPath(userData, folder, slot))
}

/** Every slot file in the folder, with its entry's text when one was kept. */
export async function listSaveSlots(userData: string, folder: unknown): Promise<StoredSaveSlot[]> {
  const path = join(userData, acceptFolder(folder))
  const slots = (await namesIn(path)).flatMap((name) => SLOT_FILE.exec(name)?.[1] ?? [])
  return Promise.all(
    slots.map(async (slot) => ({
      slot,
      entry: await readOrNull(join(path, `${slot}.entry.json`)),
    })),
  )
}

export async function deleteSaveSlot(
  userData: string,
  folder: unknown,
  slot: unknown,
): Promise<void> {
  const path = slotPath(userData, folder, slot)
  await rm(path, { force: true })
  await rm(entryPathOf(path), { force: true })
}

export async function setAsideSaveSlot(
  userData: string,
  folder: unknown,
  slot: unknown,
): Promise<void> {
  const path = slotPath(userData, folder, slot)
  try {
    await rename(path, path.replace(/\.json$/, '.refused.json'))
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }
  await rm(entryPathOf(path), { force: true })
}

async function replaceFlushed(path: string, text: string): Promise<void> {
  await writeFlushed(`${path}.tmp`, text)
  await rename(`${path}.tmp`, path)
}

async function writeFlushed(path: string, text: string): Promise<void> {
  const file = await open(path, 'w')
  try {
    await file.writeFile(text, 'utf8')
    await file.sync()
  } finally {
    await file.close()
  }
}

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

async function namesIn(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
}

function slotPath(userData: string, folder: unknown, slot: unknown): string {
  return join(userData, acceptFolder(folder), `${acceptSlot(slot)}.json`)
}

function entryPathOf(slotPath: string): string {
  return slotPath.replace(/\.json$/, '.entry.json')
}

function acceptFolder(folder: unknown): SaveFolderName {
  if (typeof folder !== 'string' || !SAVE_FOLDERS.includes(folder)) {
    throw new Error('invalid save folder')
  }
  return folder as SaveFolderName
}

function acceptSlot(slot: unknown): string {
  if (typeof slot !== 'string' || !SLOT_NAME.test(slot)) throw new Error('invalid save slot')
  return slot
}

function acceptText(text: unknown, maxBytes: number): string {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error('invalid or oversized save')
  }
  return text
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
