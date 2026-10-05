/** Answers the renderer's bridge calls. One handler per ShellBridge method. */
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import type { AppInfo } from './bridgeContract.cjs'
import { SHELL_CHANNELS } from './channels.cjs'
import { readShellLaunch } from './launchOptions.cjs'
import { appendRunCommands, appendRunEvents, writeRunDocument } from './runLogFiles.cjs'
import { readSaveSlot, setAsideSaveSlot, writeSaveSlot } from './saveFiles.cjs'

export function registerShellHandlers(): void {
  const userData = app.getPath('userData')
  const logsRoot = join(userData, 'logs')

  const launch = readShellLaunch(process.argv, process.env)

  ipcMain.handle(SHELL_CHANNELS.getAppInfo, (): AppInfo => readAppInfo())
  ipcMain.on(SHELL_CHANNELS.getLaunch, (event) => {
    event.returnValue = launch
  })
  ipcMain.handle(SHELL_CHANNELS.appendRunEvents, (_event, runId, ndjsonLines) =>
    appendRunEvents(logsRoot, runId, ndjsonLines),
  )
  ipcMain.handle(SHELL_CHANNELS.appendRunCommands, (_event, runId, ndjsonLines) =>
    appendRunCommands(logsRoot, runId, ndjsonLines),
  )
  ipcMain.handle(SHELL_CHANNELS.writeRunDocument, (_event, runId, document, json) =>
    writeRunDocument(logsRoot, runId, document, json),
  )
  ipcMain.handle(SHELL_CHANNELS.writeSaveSlot, (_event, folder, slot, json) =>
    writeSaveSlot(userData, folder, slot, json),
  )
  ipcMain.handle(SHELL_CHANNELS.readSaveSlot, (_event, folder, slot) =>
    readSaveSlot(userData, folder, slot),
  )
  ipcMain.handle(SHELL_CHANNELS.setAsideSaveSlot, (_event, folder, slot) =>
    setAsideSaveSlot(userData, folder, slot),
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
