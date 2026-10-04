/**
 * The shell in a plain browser: no filesystem, so run files are kept in memory (a bot can read
 * them back through the debug handle). A real download/OPFS writer can replace this later.
 */
import { readLaunchParameters } from './launchParameters'
import { exposeOnWindow, runOnPageHide } from './sharedBrowserHooks'
import type { Shell } from './shell'

export function createBrowserShell(): Shell {
  const eventLinesByRun = new Map<string, string>()
  const documentsByRun = new Map<string, string>()

  return {
    kind: 'browser',
    launch: readLaunchParameters(),
    getAppInfo: async () => ({
      name: 'steampunk-miner',
      version: 'browser',
      platform: 'browser',
      isPackaged: false,
    }),
    appendRunEvents: async (runId, lines) => {
      eventLinesByRun.set(runId, (eventLinesByRun.get(runId) ?? '') + lines)
    },
    writeRunDocument: async (runId, document, json) => {
      documentsByRun.set(`${runId}/${document}`, json)
    },
    readBufferedRunEvents: (runId) => eventLinesByRun.get(runId) ?? '',
    exposeGlobalHandle: exposeOnWindow,
    onPageHide: runOnPageHide,
  }
}
