/** The shell under Electron: forwards to the contextBridge object the preload exposed. */
import type { ShellBridge } from '../../electron/bridgeContract.cts'
import { readLaunchParameters } from './launchParameters'
import { exposeOnWindow, listenForKeys, runOnPageHide } from './sharedBrowserHooks'
import type { Shell } from './shell'

export function createElectronShell(bridge: ShellBridge): Shell {
  return {
    kind: 'electron',
    launch: readLaunchParameters(),
    getAppInfo: () => bridge.getAppInfo(),
    appendRunEvents: (runId, lines) => bridge.appendRunEvents(runId, lines),
    appendRunCommands: (runId, lines) => bridge.appendRunCommands(runId, lines),
    writeRunDocument: (runId, document, json) => bridge.writeRunDocument(runId, document, json),
    readBufferedRunEvents: () => '',
    readBufferedRunCommands: () => '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
    onKeyChange: listenForKeys,
  }
}
