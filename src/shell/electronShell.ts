/** The shell under Electron: forwards to the contextBridge object the preload exposed. */
import type { ShellBridge } from '../../electron/bridgeContract.cts'
import { readElectronLaunchParameters } from './launchParameters'
import { watchPageListeners } from './listenerCount'
import { trackCanvasPointer } from './mouseHooks'
import { readPageMemory } from './pageMemory'
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
  setRootAttributes,
  setRootStyle,
  vibrateDevice,
} from './screenHooks'
import { handOverSaveFile, pickSaveFile, runOnFirstTap } from './saveFileHooks'
import { preferencesFileOf, saveFolderOf, type Shell } from './shell'

export function createElectronShell(bridge: ShellBridge): Shell {
  const launch = readElectronLaunchParameters(bridge.getLaunch())
  const folder = saveFolderOf(launch)
  const preferencesFile = preferencesFileOf(launch)
  return {
    kind: 'electron',
    launch,
    getAppInfo: () => bridge.getAppInfo(),
    appendRunEvents: (runId, lines) => bridge.appendRunEvents(runId, lines),
    appendRunCommands: (runId, lines) => bridge.appendRunCommands(runId, lines),
    writeRunDocument: (runId, document, json) => bridge.writeRunDocument(runId, document, json),
    writeSaveSlot: (slot, json, entryJson) => bridge.writeSaveSlot(folder, slot, json, entryJson),
    readSaveSlot: (slot) => bridge.readSaveSlot(folder, slot),
    listSaveSlots: () => bridge.listSaveSlots(folder),
    deleteSaveSlot: (slot) => bridge.deleteSaveSlot(folder, slot),
    setAsideSaveSlot: (slot) => bridge.setAsideSaveSlot(folder, slot),
    askToKeepSaves: async () => true,
    onFirstTap: runOnFirstTap,
    handOverSaveFile,
    pickSaveFile,
    readPreferences: () => bridge.readPreferences(preferencesFile),
    writePreferences: (json) => bridge.writePreferences(preferencesFile, json),
    readBufferedRunEvents: () => '',
    readBufferedRunCommands: () => '',
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
    setScreenAttributes: setRootAttributes,
    onTouchInput: listenForTouches,
    vibrate: vibrateDevice,
    writeRunSnapshot: (runId, file, bytes) => bridge.writeRunSnapshot(runId, file, bytes),
    writeHeapSnapshot: (runId, file) => bridge.writeHeapSnapshot(runId, file),
    exportRunSnapshots: async () => null,
  }
}
