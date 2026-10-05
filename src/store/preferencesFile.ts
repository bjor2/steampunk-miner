/**
 * The one writer of the local preferences file (#33, #16): the store hands every settings change
 * here and it goes to the shell, queued so writes land in order. At start `loadPreferences` reads
 * the file back; a file this build refuses leaves the defaults in force and its problems on the
 * console. Never part of a save, the digest or the replay.
 */
import {
  preferencesText,
  readPreferences,
  type Preferences,
  type PreferencesReading,
} from '../systems/input/preferences'

/** The shell's preferences file, as the store needs it; tests pass a memory copy. */
export interface PreferencesStorage {
  read(): Promise<string | null>
  write(json: string): Promise<void>
}

let storage: PreferencesStorage | null = null
let writes: Promise<void> = Promise.resolve()

/** Before this (and in tests that do not care) settings live in memory only. */
export function installPreferencesStorage(next: PreferencesStorage | null): void {
  storage = next
  writes = Promise.resolve()
}

export async function loadPreferences(): Promise<PreferencesReading> {
  return readPreferences(storage === null ? null : await storage.read())
}

export function writePreferences(prefs: Preferences): void {
  if (storage === null) return
  const target = storage
  writes = writes
    .then(() => target.write(preferencesText(prefs)))
    .catch((error) => console.error('preferences write failed', error))
}

/** Settles once every queued write has reached the shell; specs await it. */
export function preferencesWrites(): Promise<void> {
  return writes
}
