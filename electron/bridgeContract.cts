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

export interface ShellBridge {
  getAppInfo(): Promise<AppInfo>
  /** Appends already-formatted NDJSON lines (each ending in a newline) to the run's events file. */
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
  /** Appends authority commands as NDJSON lines to the run's commands file (the replay input). */
  appendRunCommands(runId: string, ndjsonLines: string): Promise<void>
  /** Replaces the run's metadata.json or summary.json. */
  writeRunDocument(runId: string, document: RunDocumentName, json: string): Promise<void>
}
