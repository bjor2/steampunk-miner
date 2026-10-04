/**
 * The shell: the ONE bridge from the game to Electron and browser APIs. Nothing else in src/
 * touches `window.steampunkShell`, the URL, page lifecycle events or global handles. Under
 * Electron it forwards to the preload bridge; in a plain browser it falls back to in-memory
 * buffers so the same game code runs in both.
 */
import type { AppInfo, RunDocumentName } from '../../electron/bridgeContract.cts'
import { createBrowserShell } from './browserShell'
import { createElectronShell } from './electronShell'

export type { AppInfo, RunDocumentName }

export interface LaunchParameters {
  /** True in the dev build, or with `?debug` on the URL: exposes the debug/scenario API. */
  debugEnabled: boolean
  /** Raw `?scenario=<json>` text, if present. */
  scenarioText: string | null
}

export interface Shell {
  readonly kind: 'electron' | 'browser'
  readonly launch: LaunchParameters
  getAppInfo(): Promise<AppInfo>
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
  writeRunDocument(runId: string, document: RunDocumentName, json: string): Promise<void>
  /** Browser only: the NDJSON written so far (Electron writes files instead and returns ''). */
  readBufferedRunEvents(runId: string): string
  /** Puts a handle on `window` for bots and the dev console (Playwright, design doc section 20). */
  exposeGlobalHandle(name: string, handle: unknown): void
  /** Runs when the page is hidden or closing: the last chance to flush the run log. */
  onPageHide(callback: () => void): void
}

let shell: Shell | null = null

export function getShell(): Shell {
  shell ??= window.steampunkShell
    ? createElectronShell(window.steampunkShell)
    : createBrowserShell()
  return shell
}

/** Typed access to what the preload exposes; see electron/preload.cts. */
declare global {
  interface Window {
    steampunkShell?: import('../../electron/bridgeContract.cts').ShellBridge
  }
}
