/**
 * The shell in a plain browser: no filesystem, so the newest run-log lines are kept in memory (a
 * bot can read them back through the debug handle) and a debug run's snapshots in IndexedDB. A real download/OPFS writer can replace this
 * later. Save slots go to localStorage, so quit and resume works in the browser too; one `setItem`
 * is all-or-nothing, which is the browser's atomic write.
 */
import { keepNewestLines } from '../logging/ndjson'
import { createBrowserSnapshots } from './browserSnapshots'
import { readBrowserLaunchParameters } from './launchParameters'
import { watchPageListeners } from './listenerCount'
import { readPageMemory } from './pageMemory'
import {
  exposeOnWindow,
  listenForKeys,
  listenForScrollNotches,
  runOnPageHide,
} from './sharedBrowserHooks'
import {
  listenForScreenChanges,
  listenForTouches,
  readScreen,
  setRootStyle,
  vibrateDevice,
} from './screenHooks'
import { preferencesFileOf, saveFolderOf, type Shell } from './shell'

/**
 * The newest run-log text kept per run and file (#117): about 13 minutes of a ?debug run at the
 * 0.078 MB/min the memory soak measured, so a long session stays bounded while the debug readers
 * (the e2e smoke's `game_started`, a bot's recent lines) still find what they look for.
 */
const KEPT_RUN_LOG_CHARS = 1_000_000

export function createBrowserShell(): Shell {
  const launch = readBrowserLaunchParameters()
  const slotKey = (slot: number) => `steampunk-miner/${saveFolderOf(launch)}/slot-${slot}.json`
  const preferencesKey = `steampunk-miner/${preferencesFileOf(launch)}.json`
  const eventLinesByRun = new Map<string, string>()
  const commandLinesByRun = new Map<string, string>()
  const documentsByRun = new Map<string, string>()
  const snapshots = createBrowserSnapshots()

  return {
    kind: 'browser',
    launch,
    getAppInfo: async () => ({
      name: 'steampunk-miner',
      version: 'browser',
      platform: 'browser',
      isPackaged: false,
    }),
    appendRunEvents: async (runId, lines) =>
      appendKeepingNewestLines(eventLinesByRun, runId, lines),
    appendRunCommands: async (runId, lines) =>
      appendKeepingNewestLines(commandLinesByRun, runId, lines),
    writeRunDocument: async (runId, document, json) => {
      documentsByRun.set(`${runId}/${document}`, json)
    },
    writeSaveSlot: async (slot, json) => window.localStorage.setItem(slotKey(slot), json),
    readSaveSlot: async (slot) => window.localStorage.getItem(slotKey(slot)),
    setAsideSaveSlot: async (slot) => setAsideStoredSlot(slotKey(slot)),
    readPreferences: async () => window.localStorage.getItem(preferencesKey),
    writePreferences: async (json) => window.localStorage.setItem(preferencesKey, json),
    readBufferedRunEvents: (runId) => eventLinesByRun.get(runId) ?? '',
    readBufferedRunCommands: (runId) => commandLinesByRun.get(runId) ?? '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
    onKeyChange: listenForKeys,
    onScrollNotch: listenForScrollNotches,
    watchPageListeners,
    readPageMemory,
    readScreen,
    onScreenChange: listenForScreenChanges,
    setScreenStyle: setRootStyle,
    onTouchInput: listenForTouches,
    vibrate: vibrateDevice,
    writeRunSnapshot: (runId, file, bytes) => snapshots.write(runId, file, bytes),
    writeHeapSnapshot: async () => null,
    exportRunSnapshots: () => snapshots.exportAll(),
  }
}

function appendKeepingNewestLines(
  linesByRun: Map<string, string>,
  runId: string,
  lines: string,
): void {
  linesByRun.set(runId, keepNewestLines((linesByRun.get(runId) ?? '') + lines, KEPT_RUN_LOG_CHARS))
}

function setAsideStoredSlot(key: string): void {
  const refused = window.localStorage.getItem(key)
  if (refused === null) return
  window.localStorage.setItem(key.replace(/\.json$/, '.refused.json'), refused)
  window.localStorage.removeItem(key)
}
