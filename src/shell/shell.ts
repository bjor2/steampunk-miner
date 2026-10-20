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
  StoredSaveSlot,
} from '../../electron/bridgeContract.cts'
import type { MaterialPopMode } from '../systems/materialPop/materialPopMode'
import type { PadReading } from '../systems/input/padFrame'
import type { ScreenReading } from '../systems/views/screenLayout'
import { createBrowserShell } from './browserShell'
import type { ShellDevFlagStorage } from './devFlagStorage'
import { createElectronShell } from './electronShell'
import type { PageMemory } from './pageMemory'

export type { AppInfo, PageMemory, RunDocumentName, StoredSaveSlot }

export interface LaunchParameters {
  /** The debug/scenario API is exposed: the dev build, `?debug` in a browser, `--debug-api` in Electron. */
  debugEnabled: boolean
  /** A scenario's raw JSON text: `?scenario=` in a browser, a `--scenario=<path>` file in Electron. */
  scenarioText: string | null
  /**
   * The launch opens on the title menu (ticket 403): a player's launch does, and a debug one only
   * with `?title`, so specs and tools keep starting straight into play. Never with a scenario,
   * which sets its own start.
   */
  isTitleMenuShown: boolean
  /**
   * `?noflags` (ticket 548): the browser's dev flag overrides and the tab's debug session marker
   * are forgotten before anything reads them, so the game boots on the shipped flags. Electron
   * reads no URL: false.
   */
  isNoFlagsAsked: boolean
  /**
   * `?pop=A` or `?pop=B` (ticket 614): the material pop prototype's mode for this session; null
   * when the URL asks none (or Electron, which reads no URL), so the session starts on A.
   */
  materialPopMode: MaterialPopMode | null
}

/** One key going down or up (`KeyboardEvent.code`, e.g. "KeyA"), as the input layer reads it. */
export interface KeyChange {
  code: string
  isDown: boolean
  /** The browser's auto-repeat of a held key: edge actions ignore it (#33 section 1). */
  isRepeat: boolean
  isShiftHeld: boolean
}

/** The mouse over the game canvas, in the canvas's CSS pixels from its top-left corner. */
export interface CanvasPointer {
  x: number
  y: number
}

/** What `exportSnapshots()` handed the player (#123): the zip's download name, size and entries. */
export interface SnapshotExport {
  file: string
  bytes: number
  entries: string[]
}

/** One notch of the mouse wheel (or a trackpad's worth of scrolling): `up` rolls away from the player. */
export type ScrollNotch = 'up' | 'down'

export interface Shell {
  readonly kind: 'electron' | 'browser'
  readonly launch: LaunchParameters
  /** The browser's dev flag overrides and the tab's debug session marker (ticket 548). */
  readonly devFlags: ShellDevFlagStorage
  getAppInfo(): Promise<AppInfo>
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
  appendRunCommands(runId: string, ndjsonLines: string): Promise<void>
  writeRunDocument(runId: string, document: RunDocumentName, json: string): Promise<void>
  /** Browser only: the newest event NDJSON lines, up to a cap (Electron writes files and returns ''). */
  readBufferedRunEvents(runId: string): string
  /** Browser only: the newest command NDJSON lines, up to a cap (Electron writes files and returns ''). */
  readBufferedRunCommands(runId: string): string
  /**
   * Replaces a save slot (`autosave`, `slot-1` .. `slot-9`, #401) atomically, then its index
   * entry, in the folder this run's saves belong to (`saveFolderOf`).
   */
  writeSaveSlot(slot: string, json: string, entryJson: string): Promise<void>
  /** The slot's text, or null when it holds no save. */
  readSaveSlot(slot: string): Promise<string | null>
  /** Every slot holding a save, with its index entry's text (null when none was kept). */
  listSaveSlots(): Promise<StoredSaveSlot[]>
  /** Empties a slot: its save and its entry. */
  deleteSaveSlot(slot: string): Promise<void>
  /** Moves a save this build refused out of the way, so the next write cannot overwrite it. */
  setAsideSaveSlot(slot: string): Promise<void>
  /**
   * Asks to keep the save folder from eviction (#470 P1-8): a browser's `storage.persist()`,
   * answered true when granted; Electron's files are kept anyway.
   */
  askToKeepSaves(): Promise<boolean>
  /** Runs once, at the first finger or button pressed on the page. */
  onFirstTap(callback: () => void): void
  /** Hands a save file to the player (a download, or a phone's share sheet), its exact text. */
  handOverSaveFile(fileName: string, json: string): Promise<void>
  /** Lets the player pick a save file; its text, or null when they picked none. */
  pickSaveFile(): Promise<string | null>
  /** Puts a handle on `window` for bots and the dev console (Playwright, design doc section 20). */
  exposeGlobalHandle(name: string, handle: unknown): void
  /** The local preferences file's text (#33), or null when none was written yet. */
  readPreferences(): Promise<string | null>
  /** Replaces the local preferences file; a debug run writes its own (`preferencesFileOf`). */
  writePreferences(json: string): Promise<void>
  /**
   * Reports key presses and releases, and the mouse buttons pressed on the game canvas as the
   * codes `MouseLeft`/`MouseRight` (ticket 345); returns an unsubscribe.
   */
  onKeyChange(listener: (key: KeyChange) => void): () => void
  /** The mouse cursor over the game canvas; null off it, before any mouse move, or on touch. */
  readPointer(): CanvasPointer | null
  /** Reports mouse-wheel notches; returns an unsubscribe. */
  onScrollNotch(listener: (notch: ScrollNotch) => void): () => void
  /**
   * Hands over the connected gamepad once per animation frame, then null once it disconnects
   * (ticket 346); nothing while none is connected. Returns an unsubscribe.
   */
  onPadFrame(listener: (pad: PadReading | null) => void): () => void
  /** Runs when the page is hidden or closing: the last chance to flush the run log. */
  onPageHide(callback: () => void): void
  /** Starts counting the page's event listeners; test runs only, before the scene mounts (#121). */
  watchPageListeners(): void
  /** The page's JS heap, DOM elements and counted listeners now, for `memory_sample` (#121). */
  readPageMemory(): PageMemory
  /** The window in CSS pixels and whether its primary pointer is a finger (#173). */
  readScreen(): ScreenReading
  /** Reports a resize, a rotation or a change of primary pointer; returns an unsubscribe. */
  onScreenChange(listener: () => void): () => void
  /** Sets custom properties on the page root, the one place the UI's scale is written (#173). */
  setScreenStyle(properties: Readonly<Record<string, string>>): void
  /** Sets attributes on the page root: `data-orientation`, the panels' layout switch (ticket 483). */
  setScreenAttributes(attributes: Readonly<Record<string, string>>): void
  /** Reports each finger touching the page, so the touch controls can show (#173). */
  onTouchInput(listener: () => void): () => void
  /** A short buzz on a device with a vibration motor; nothing elsewhere (#173 haptics). */
  vibrate(milliseconds: number): void
  /**
   * A debug run's snapshot (#123), `file` named by `src/logging/runLayout.ts`: into the run folder
   * under Electron's `logs/`, into IndexedDB in a browser.
   */
  writeRunSnapshot(runId: string, file: string, bytes: Uint8Array): Promise<void>
  /** Electron writes the page's heap snapshot and answers its size; a browser page cannot: null. */
  writeHeapSnapshot(runId: string, file: string): Promise<number | null>
  /** Browser: downloads every kept snapshot as one zip. Electron's are files already: null. */
  exportRunSnapshots(): Promise<SnapshotExport | null>
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
