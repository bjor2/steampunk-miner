/**
 * The only module that writes save files to disk (decision #12, #26):
 *   <userData>/saves/slot-<n>.json        the Auto-Cloud folder
 *   <userData>/saves-debug/slot-<n>.json  a debug run's folder, never synced (#11 section 6)
 * A write goes to a temp file, is flushed, then renamed over the slot, so a crash mid-write leaves
 * the previous save whole. A save this build refused is renamed to `slot-<n>.refused.json`, so the
 * next checkpoint never overwrites a save a later build might still read.
 * Everything arriving from the renderer is treated as untrusted: folder, slot and size are checked.
 */
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { SaveFolderName } from './bridgeContract.cjs'

const SAVE_FOLDERS: readonly string[] = ['saves', 'saves-debug']
const MAX_SLOT = 9
// A fully hollowed planet 1 is about 45 KB (#4); the cap only stops a runaway renderer.
const MAX_SAVE_BYTES = 4 * 1024 * 1024

export async function writeSaveSlot(
  userData: string,
  folder: unknown,
  slot: unknown,
  json: unknown,
): Promise<void> {
  const path = slotPath(userData, folder, slot)
  const text = acceptSaveText(json)
  await mkdir(join(userData, acceptFolder(folder)), { recursive: true })
  await writeFlushed(`${path}.tmp`, text)
  await rename(`${path}.tmp`, path)
}

/** The slot's text, or null when the slot is empty. */
export async function readSaveSlot(
  userData: string,
  folder: unknown,
  slot: unknown,
): Promise<string | null> {
  try {
    return await readFile(slotPath(userData, folder, slot), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
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

function slotPath(userData: string, folder: unknown, slot: unknown): string {
  return join(userData, acceptFolder(folder), `slot-${acceptSlot(slot)}.json`)
}

function acceptFolder(folder: unknown): SaveFolderName {
  if (typeof folder !== 'string' || !SAVE_FOLDERS.includes(folder)) {
    throw new Error('invalid save folder')
  }
  return folder as SaveFolderName
}

function acceptSlot(slot: unknown): number {
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > MAX_SLOT) {
    throw new Error('invalid save slot')
  }
  return slot
}

function acceptSaveText(text: unknown): string {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SAVE_BYTES) {
    throw new Error('invalid or oversized save')
  }
  return text
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
