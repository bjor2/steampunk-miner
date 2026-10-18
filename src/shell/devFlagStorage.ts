/**
 * Where a browser keeps its dev flag overrides (ticket 548, the TD ruling on #547 and its #548
 * ruling): one `localStorage` item, `sm.devFlagOverrides.v1`, per browser and never in a save, and
 * the tab's debug session marker in `sessionStorage`, which the hidden gesture (#549) sets so a
 * phone with no URL bar can enter a debug session.
 *
 * The overrides are read only in a debug session: `?debug` (or the dev build, `--debug-api`) or
 * the marker, and never on a scenario launch, which sets its own start (VS 1: a headless or
 * Playwright run never picks up a stored value).
 */
import { DEV_FLAG_OVERRIDES_KEY } from '../systems/devFlags/devFlagOverrides'
import type { LaunchParameters } from './shell'
import type { KeyValueStorage } from './storedSaveSlots'

/** The tab's marker, set by the hidden gesture (#549) and cleared by `?noflags` and the reset. */
export const DEBUG_SESSION_MARKER_KEY = 'sm.debugSession.v1'

export interface ShellDevFlagStorage {
  read(): string | null
  /** Replaces the item; null removes it. */
  write(text: string | null): void
  isDebugSessionMarked(): boolean
  /** The hidden gesture (#549): this tab is a debug session until it closes or is reset. */
  markDebugSession(): void
  forgetDebugSession(): void
}

/** `local` holds the overrides, `session` the tab's marker; specs pass memory copies. */
export function createDevFlagStorage(
  local: KeyValueStorage,
  session: KeyValueStorage,
): ShellDevFlagStorage {
  return {
    read: () => local.getItem(DEV_FLAG_OVERRIDES_KEY),
    write: (text) => writeOrRemove(local, text),
    isDebugSessionMarked: () => session.getItem(DEBUG_SESSION_MARKER_KEY) !== null,
    markDebugSession: () => session.setItem(DEBUG_SESSION_MARKER_KEY, '1'),
    forgetDebugSession: () => session.removeItem(DEBUG_SESSION_MARKER_KEY),
  }
}

function writeOrRemove(local: KeyValueStorage, text: string | null): void {
  if (text === null) local.removeItem(DEV_FLAG_OVERRIDES_KEY)
  else local.setItem(DEV_FLAG_OVERRIDES_KEY, text)
}

/** `?noflags`: the overrides and the marker forgotten before anything reads them. */
export function forgetDevFlagOverrides(storage: ShellDevFlagStorage): void {
  storage.write(null)
  storage.forgetDebugSession()
}

/** Whether this launch reads the overrides: a debug session's, never a scenario's. */
export function isDevFlagSession(launch: LaunchParameters, storage: ShellDevFlagStorage): boolean {
  if (launch.scenarioText !== null) return false
  return launch.debugEnabled || storage.isDebugSessionMarked()
}
