/** Answers the renderer's bridge calls. One handler per ShellBridge method. */
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import type { AppInfo } from './bridgeContract.cjs'
import { SHELL_CHANNELS } from './channels.cjs'
import { readShellLaunch } from './launchOptions.cjs'
import { appendRunCommands, appendRunEvents, writeRunDocument } from './runLogFiles.cjs'
import { readPreferences, writePreferences } from './preferencesFiles.cjs'
import { readSaveSlot, setAsideSaveSlot, writeSaveSlot } from './saveFiles.cjs'
import { writeHeapSnapshot, writeRunSnapshot } from './snapshotFiles.cjs'

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
  ipcMain.handle(SHELL_CHANNELS.readPreferences, (_event, file) => readPreferences(userData, file))
  ipcMain.handle(SHELL_CHANNELS.writePreferences, (_event, file, json) =>
    writePreferences(userData, file, json),
  )
  registerSnapshotHandlers(logsRoot, areSnapshotsAllowed(launch.debugEnabled))
}

/**
 * Snapshots (#123) are for debug runs: `--debug-api`, or the unpackaged dev window, whose renderer
 * turns the debug API on by itself. A player's build refuses them, heap snapshots above all.
 */
function areSnapshotsAllowed(isDebugApiOn: boolean): boolean {
  return isDebugApiOn || !app.isPackaged
}

function registerSnapshotHandlers(logsRoot: string, isAllowed: boolean): void {
  ipcMain.handle(SHELL_CHANNELS.writeRunSnapshot, (_event, runId, file, bytes) =>
    refuseUnless(isAllowed, () => writeRunSnapshot(logsRoot, runId, file, bytes)),
  )
  ipcMain.handle(SHELL_CHANNELS.writeHeapSnapshot, (event, runId, file) =>
    refuseUnless(isAllowed, () => writeHeapSnapshot(logsRoot, runId, file, event.sender)),
  )
}

function refuseUnless<T>(isAllowed: boolean, write: () => Promise<T>): Promise<T> {
  return isAllowed ? write() : Promise.reject(new Error('snapshots need --debug-api'))
}

function readAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }
}
