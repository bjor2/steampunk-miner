/**
 * The shell: the ONE bridge from the game to Electron and browser APIs. Nothing else in src/
 * touches `window.steampunkShell`, the URL, page lifecycle events or global handles. Under
 * Electron it forwards to the preload bridge; in a plain browser it falls back to in-memory
 * buffers so the same game code runs in both.
 */
import type {
  AppInfo,
  PreferencesFileName,
  RunDocumentName,
  SaveFolderName,
} from '../../electron/bridgeContract.cts'
import { createBrowserShell } from './browserShell'
import { createElectronShell } from './electronShell'
import type { PageMemory } from './pageMemory'

export type { AppInfo, PageMemory, RunDocumentName }

export interface LaunchParameters {
  /** The debug/scenario API is exposed: the dev build, `?debug` in a browser, `--debug-api` in Electron. */
  debugEnabled: boolean
  /** A scenario's raw JSON text: `?scenario=` in a browser, a `--scenario=<path>` file in Electron. */
  scenarioText: string | null
}

/** One key going down or up (`KeyboardEvent.code`, e.g. "KeyA"), as the input layer reads it. */
export interface KeyChange {
  code: string
  isDown: boolean
  /** The browser's auto-repeat of a held key: edge actions ignore it (#33 section 1). */
  isRepeat: boolean
  isShiftHeld: boolean
}

/** One notch of the mouse wheel (or a trackpad's worth of scrolling): `up` rolls away from the player. */
export type ScrollNotch = 'up' | 'down'

export interface Shell {
  readonly kind: 'electron' | 'browser'
  readonly launch: LaunchParameters
  getAppInfo(): Promise<AppInfo>
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
  appendRunCommands(runId: string, ndjsonLines: string): Promise<void>
  writeRunDocument(runId: string, document: RunDocumentName, json: string): Promise<void>
  /** Browser only: the newest event NDJSON lines, up to a cap (Electron writes files and returns ''). */
  readBufferedRunEvents(runId: string): string
  /** Browser only: the newest command NDJSON lines, up to a cap (Electron writes files and returns ''). */
  readBufferedRunCommands(runId: string): string
  /** Replaces a save slot atomically, in the folder this run's saves belong to (`saveFolderOf`). */
  writeSaveSlot(slot: number, json: string): Promise<void>
  /** The slot's text, or null when it holds no save. */
  readSaveSlot(slot: number): Promise<string | null>
  /** Moves a save this build refused out of the way, so the next checkpoint cannot overwrite it. */
  setAsideSaveSlot(slot: number): Promise<void>
  /** Puts a handle on `window` for bots and the dev console (Playwright, design doc section 20). */
  exposeGlobalHandle(name: string, handle: unknown): void
  /** The local preferences file's text (#33), or null when none was written yet. */
  readPreferences(): Promise<string | null>
  /** Replaces the local preferences file; a debug run writes its own (`preferencesFileOf`). */
  writePreferences(json: string): Promise<void>
  /** Reports key presses and releases; returns an unsubscribe. */
  onKeyChange(listener: (key: KeyChange) => void): () => void
  /** Reports mouse-wheel notches; returns an unsubscribe. */
  onScrollNotch(listener: (notch: ScrollNotch) => void): () => void
  /** Runs when the page is hidden or closing: the last chance to flush the run log. */
  onPageHide(callback: () => void): void
  /** Starts counting the page's event listeners; test runs only, before the scene mounts (#121). */
  watchPageListeners(): void
  /** The page's JS heap, DOM elements and counted listeners now, for `memory_sample` (#121). */
  readPageMemory(): PageMemory
}

/**
 * A debug-enabled or scenario run never writes into the cloud-synced folder (#11 section 6, #12),
 * so it can never replace a player's save.
 */
export function saveFolderOf(launch: LaunchParameters): SaveFolderName {
  const isDebugRun = launch.debugEnabled || launch.scenarioText !== null
  return isDebugRun ? 'saves-debug' : 'saves'
}

/** Like saves, a debug or scenario run never touches the player's settings. */
export function preferencesFileOf(launch: LaunchParameters): PreferencesFileName {
  const isDebugRun = launch.debugEnabled || launch.scenarioText !== null
  return isDebugRun ? 'preferences-debug' : 'preferences'
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
