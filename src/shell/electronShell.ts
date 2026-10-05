/** The shell under Electron: forwards to the contextBridge object the preload exposed. */
import type { ShellBridge } from '../../electron/bridgeContract.cts'
import { readLaunchParameters } from './launchParameters'
import { exposeOnWindow, listenForKeys, runOnPageHide } from './sharedBrowserHooks'
import { saveFolderOf, type Shell } from './shell'

export function createElectronShell(bridge: ShellBridge): Shell {
  const launch = readLaunchParameters()
  const folder = saveFolderOf(launch)
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
    readBufferedRunEvents: () => '',
    readBufferedRunCommands: () => '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
    onKeyChange: listenForKeys,
  }
}
