/**
 * The shell in a plain browser: no filesystem, so run files are kept in memory (a bot can read
 * them back through the debug handle). A real download/OPFS writer can replace this later.
 * Save slots go to localStorage, so quit and resume works in the browser too; one `setItem` is
 * all-or-nothing, which is the browser's atomic write.
 */
import { readLaunchParameters } from './launchParameters'
import { exposeOnWindow, listenForKeys, runOnPageHide } from './sharedBrowserHooks'
import { saveFolderOf, type Shell } from './shell'

export function createBrowserShell(): Shell {
  const launch = readLaunchParameters()
  const slotKey = (slot: number) => `steampunk-miner/${saveFolderOf(launch)}/slot-${slot}.json`
  const eventLinesByRun = new Map<string, string>()
  const commandLinesByRun = new Map<string, string>()
  const documentsByRun = new Map<string, string>()

  return {
    kind: 'browser',
    launch,
    getAppInfo: async () => ({
      name: 'steampunk-miner',
      version: 'browser',
      platform: 'browser',
      isPackaged: false,
    }),
    appendRunEvents: async (runId, lines) => {
      eventLinesByRun.set(runId, (eventLinesByRun.get(runId) ?? '') + lines)
    },
    appendRunCommands: async (runId, lines) => {
      commandLinesByRun.set(runId, (commandLinesByRun.get(runId) ?? '') + lines)
    },
    writeRunDocument: async (runId, document, json) => {
      documentsByRun.set(`${runId}/${document}`, json)
    },
    writeSaveSlot: async (slot, json) => window.localStorage.setItem(slotKey(slot), json),
    readSaveSlot: async (slot) => window.localStorage.getItem(slotKey(slot)),
    setAsideSaveSlot: async (slot) => setAsideStoredSlot(slotKey(slot)),
    readBufferedRunEvents: (runId) => eventLinesByRun.get(runId) ?? '',
    readBufferedRunCommands: (runId) => commandLinesByRun.get(runId) ?? '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
    onKeyChange: listenForKeys,
  }
}

function setAsideStoredSlot(key: string): void {
  const refused = window.localStorage.getItem(key)
  if (refused === null) return
  window.localStorage.setItem(key.replace(/\.json$/, '.refused.json'), refused)
  window.localStorage.removeItem(key)
}
