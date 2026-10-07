/**
 * Preload: exposes the minimal typed bridge to the renderer as `window.steampunkShell`. Runs
 * sandboxed with context isolation, so the renderer gets these few functions and nothing of
 * Node or Electron. Every addition here widens what a compromised page could do: validate in
 * the main process (electron/ipcHandlers.cts), not here.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { ShellBridge } from './bridgeContract.cjs'
import type { SHELL_CHANNELS } from './channels.cjs'

// Repeated from channels.cts because a sandboxed preload cannot require local modules.
const channels = {
  getAppInfo: 'shell:getAppInfo',
  getLaunch: 'shell:getLaunch',
  appendRunEvents: 'shell:appendRunEvents',
  appendRunCommands: 'shell:appendRunCommands',
  writeRunDocument: 'shell:writeRunDocument',
  writeSaveSlot: 'shell:writeSaveSlot',
  readSaveSlot: 'shell:readSaveSlot',
  setAsideSaveSlot: 'shell:setAsideSaveSlot',
  readPreferences: 'shell:readPreferences',
  writePreferences: 'shell:writePreferences',
  writeRunSnapshot: 'shell:writeRunSnapshot',
  writeHeapSnapshot: 'shell:writeHeapSnapshot',
} as const satisfies typeof SHELL_CHANNELS

const bridge: ShellBridge = {
  getAppInfo: () => ipcRenderer.invoke(channels.getAppInfo),
  getLaunch: () => ipcRenderer.sendSync(channels.getLaunch),
  appendRunEvents: (runId, ndjsonLines) =>
    ipcRenderer.invoke(channels.appendRunEvents, runId, ndjsonLines),
  appendRunCommands: (runId, ndjsonLines) =>
    ipcRenderer.invoke(channels.appendRunCommands, runId, ndjsonLines),
  writeRunDocument: (runId, document, json) =>
    ipcRenderer.invoke(channels.writeRunDocument, runId, document, json),
  writeSaveSlot: (folder, slot, json) =>
    ipcRenderer.invoke(channels.writeSaveSlot, folder, slot, json),
  readSaveSlot: (folder, slot) => ipcRenderer.invoke(channels.readSaveSlot, folder, slot),
  setAsideSaveSlot: (folder, slot) => ipcRenderer.invoke(channels.setAsideSaveSlot, folder, slot),
  readPreferences: (file) => ipcRenderer.invoke(channels.readPreferences, file),
  writePreferences: (file, json) => ipcRenderer.invoke(channels.writePreferences, file, json),
  writeRunSnapshot: (runId, file, bytes) =>
    ipcRenderer.invoke(channels.writeRunSnapshot, runId, file, bytes),
  writeHeapSnapshot: (runId, file) => ipcRenderer.invoke(channels.writeHeapSnapshot, runId, file),
}

contextBridge.exposeInMainWorld('steampunkShell', bridge)
