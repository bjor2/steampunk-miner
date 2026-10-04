/**
 * Preload: exposes the minimal typed bridge to the renderer as `window.steampunkShell`. Runs
 * sandboxed with context isolation, so the renderer gets these three functions and nothing of
 * Node or Electron. Every addition here widens what a compromised page could do: validate in
 * the main process (electron/ipcHandlers.cts), not here.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { ShellBridge } from './bridgeContract.cjs'
import type { SHELL_CHANNELS } from './channels.cjs'

// Repeated from channels.cts because a sandboxed preload cannot require local modules.
const channels = {
  getAppInfo: 'shell:getAppInfo',
  appendRunEvents: 'shell:appendRunEvents',
  writeRunDocument: 'shell:writeRunDocument',
} as const satisfies typeof SHELL_CHANNELS

const bridge: ShellBridge = {
  getAppInfo: () => ipcRenderer.invoke(channels.getAppInfo),
  appendRunEvents: (runId, ndjsonLines) =>
    ipcRenderer.invoke(channels.appendRunEvents, runId, ndjsonLines),
  writeRunDocument: (runId, document, json) =>
    ipcRenderer.invoke(channels.writeRunDocument, runId, document, json),
}

contextBridge.exposeInMainWorld('steampunkShell', bridge)
