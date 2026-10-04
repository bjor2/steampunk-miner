/** Answers the renderer's bridge calls. One handler per ShellBridge method. */
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import type { AppInfo } from './bridgeContract.cjs'
import { SHELL_CHANNELS } from './channels.cjs'
import { appendRunEvents, writeRunDocument } from './runLogFiles.cjs'

export function registerShellHandlers(): void {
  const logsRoot = join(app.getPath('userData'), 'logs')

  ipcMain.handle(SHELL_CHANNELS.getAppInfo, (): AppInfo => readAppInfo())
  ipcMain.handle(SHELL_CHANNELS.appendRunEvents, (_event, runId, ndjsonLines) =>
    appendRunEvents(logsRoot, runId, ndjsonLines),
  )
  ipcMain.handle(SHELL_CHANNELS.writeRunDocument, (_event, runId, document, json) =>
    writeRunDocument(logsRoot, runId, document, json),
  )
}

function readAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }
}
