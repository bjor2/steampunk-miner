/** The shell under Electron: forwards to the contextBridge object the preload exposed. */
import type { ShellBridge } from '../../electron/bridgeContract.cts'
import { readElectronLaunchParameters } from './launchParameters'
import { watchPageListeners } from './listenerCount'
import { readPageMemory } from './pageMemory'
import {
  exposeOnWindow,
  listenForKeys,
  listenForScrollNotches,
  runOnPageHide,
} from './sharedBrowserHooks'
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
    writeSaveSlot: (slot, json) => bridge.writeSaveSlot(folder, slot, json),
    readSaveSlot: (slot) => bridge.readSaveSlot(folder, slot),
    setAsideSaveSlot: (slot) => bridge.setAsideSaveSlot(folder, slot),
    readPreferences: () => bridge.readPreferences(preferencesFile),
    writePreferences: (json) => bridge.writePreferences(preferencesFile, json),
    readBufferedRunEvents: () => '',
    readBufferedRunCommands: () => '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
    onKeyChange: listenForKeys,
    onScrollNotch: listenForScrollNotches,
    watchPageListeners,
    readPageMemory,
  }
}
