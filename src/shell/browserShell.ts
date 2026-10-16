/**
 * The shell in a plain browser: no filesystem, so the newest run-log lines are kept in memory (a
 * bot can read them back through the debug handle) and a debug run's snapshots in IndexedDB. A real download/OPFS writer can replace this
 * later. Save slots go to localStorage (`storedSaveSlots.ts`), mirrored to IndexedDB
 * (`indexedSaveFolder.ts`, #470 P1-8), so quit and resume works in the browser too and one full
 * or cleared store loses no save.
 */
import { keepNewestLines } from '../logging/ndjson'
import { createBrowserSnapshots } from './browserSnapshots'
import { readBrowserLaunchParameters } from './launchParameters'
import { watchPageListeners } from './listenerCount'
import { trackCanvasPointer } from './mouseHooks'
import { readPageMemory } from './pageMemory'
import { createIndexedSaveFolder } from './indexedSaveFolder'
import { mirrorSaveFolder, settlingFolderOf } from './mirroredSaveFolder'
import {
  askBrowserToKeepStorage,
  handOverSaveFile,
  pickSaveFile,
  runOnFirstTap,
} from './saveFileHooks'
import { createStoredSaveFolder } from './storedSaveSlots'
import { listenForGamepad } from './gamepadHooks'
import {
  exposeOnWindow,
  listenForKeyChanges,
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
  const folderKey = `steampunk-miner/${saveFolderOf(launch)}`
  const saves = mirrorSaveFolder(
    settlingFolderOf(createStoredSaveFolder(window.localStorage, folderKey)),
    createIndexedSaveFolder(folderKey),
  )
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
    writeSaveSlot: (slot, json, entryJson) => saves.write(slot, json, entryJson),
    readSaveSlot: (slot) => saves.read(slot),
    listSaveSlots: () => saves.list(),
    deleteSaveSlot: (slot) => saves.remove(slot),
    setAsideSaveSlot: (slot) => saves.setAside(slot),
    askToKeepSaves: askBrowserToKeepStorage,
    onFirstTap: runOnFirstTap,
    handOverSaveFile,
    pickSaveFile,
    readPreferences: async () => window.localStorage.getItem(preferencesKey),
    writePreferences: async (json) => window.localStorage.setItem(preferencesKey, json),
    readBufferedRunEvents: (runId) => eventLinesByRun.get(runId) ?? '',
    readBufferedRunCommands: (runId) => commandLinesByRun.get(runId) ?? '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
    onKeyChange: listenForKeyChanges,
    readPointer: trackCanvasPointer(),
    onScrollNotch: listenForScrollNotches,
    onPadFrame: listenForGamepad,
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
