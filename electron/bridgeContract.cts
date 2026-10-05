/**
 * The one typed contract between the Electron main process and the renderer. Types only: the
 * renderer imports it as a type, the preload implements it, the main process answers it.
 * Keep it minimal; every addition is attack surface (see electron/preload.cts).
 */

export interface AppInfo {
  name: string
  version: string
  /** Node's process.platform, e.g. "win32", "linux", "darwin". */
  platform: string
  isPackaged: boolean
}

/** The two non-event files of a run folder (design doc section 23). */
export type RunDocumentName = 'metadata' | 'summary'

/**
 * Where a run's checkpoints go (#12, #11 section 6): `saves` is the Auto-Cloud folder, a
 * debug-enabled run writes to `saves-debug` and never touches the cloud.
 */
export type SaveFolderName = 'saves' | 'saves-debug'

/**
 * What the main process was launched with (#11 section 6): the debug API only with
 * `--debug-api`, and a `--scenario=<path>` file's text only then.
 */
/**
 * The local preferences file (#33): presentation settings and rebinding, never in a save. A debug
 * run keeps its own file, so a test never changes a player's settings.
 */
export type PreferencesFileName = 'preferences' | 'preferences-debug'

export interface ShellLaunch {
  debugEnabled: boolean
  scenarioText: string | null
}

export interface ShellBridge {
  getAppInfo(): Promise<AppInfo>
  /** Synchronous, read once at page start: the shell is created before anything awaits. */
  getLaunch(): ShellLaunch
  /** Appends already-formatted NDJSON lines (each ending in a newline) to the run's events file. */
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
  /** Appends authority commands as NDJSON lines to the run's commands file (the replay input). */
  appendRunCommands(runId: string, ndjsonLines: string): Promise<void>
  /** Replaces the run's metadata.json or summary.json. */
  writeRunDocument(runId: string, document: RunDocumentName, json: string): Promise<void>
  /** Replaces `<userData>/<folder>/slot-<slot>.json` atomically (temp file, then rename). */
  writeSaveSlot(folder: SaveFolderName, slot: number, json: string): Promise<void>
  /** The slot's text, or null when it holds no save. */
  readSaveSlot(folder: SaveFolderName, slot: number): Promise<string | null>
  /** Keeps a save this build refused as `slot-<slot>.refused.json`, out of the next write's way. */
  setAsideSaveSlot(folder: SaveFolderName, slot: number): Promise<void>
  /** `<userData>/<file>.json`, or null when it was never written. */
  readPreferences(file: PreferencesFileName): Promise<string | null>
  /** Replaces `<userData>/<file>.json` atomically (temp file, then rename). */
  writePreferences(file: PreferencesFileName, json: string): Promise<void>
}
