/**
 * The only module that writes the local preferences file (#33, #16): `<userData>/preferences.json`
 * for play, `<userData>/preferences-debug.json` for a debug run. Written to a temp file, flushed,
 * then renamed, like a save. Everything from the renderer is untrusted: the name and size are
 * checked; the content is the renderer's to validate when it reads it back.
 */
import { open, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { PreferencesFileName } from './bridgeContract.cjs'

const PREFERENCES_FILES: readonly string[] = ['preferences', 'preferences-debug']
// Settings and a rebinding table are a few KB; the cap only stops a runaway renderer.
const MAX_PREFERENCES_BYTES = 64 * 1024

export async function readPreferences(userData: string, file: unknown): Promise<string | null> {
  try {
    return await readFile(preferencesPath(userData, file), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
    throw error
  }
}

export async function writePreferences(
  userData: string,
  file: unknown,
  json: unknown,
): Promise<void> {
  const path = preferencesPath(userData, file)
  const text = acceptPreferencesText(json)
  const temp = await open(`${path}.tmp`, 'w')
  try {
    await temp.writeFile(text, 'utf8')
    await temp.sync()
  } finally {
    await temp.close()
  }
  await rename(`${path}.tmp`, path)
}

function preferencesPath(userData: string, file: unknown): string {
  if (typeof file !== 'string' || !PREFERENCES_FILES.includes(file)) {
    throw new Error('invalid preferences file')
  }
  return join(userData, `${file as PreferencesFileName}.json`)
}

function acceptPreferencesText(text: unknown): string {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_PREFERENCES_BYTES) {
    throw new Error('invalid or oversized preferences')
  }
  return text
}
