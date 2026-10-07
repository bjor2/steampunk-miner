/**
 * Where a run's files live (design doc section 23):
 *   logs/<runId>/events.ndjson | commands.ndjson | summary.json | metadata.json
 * (`commands.ndjson` is the replay input, decision #11 section 3)
 * and a debug run's snapshots beside them (#123, logging strategy section 1):
 *   logs/<runId>/snapshots/save-<tick>.json | heap/<tick>.heapsnapshot | shots/<tick>-<trigger>.png
 * and how a run gets its id. Time is an argument; nothing here reads a clock.
 */

/** "run_2026-10-04_20-30-15", the folder name of the doc's example, in UTC. */
export function createRunId(startedAt: Date): string {
  const stamp = startedAt.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  return `run_${stamp}`
}

/** The ids the shell accepts: no path separators, no dots, bounded length. */
export function isValidRunId(runId: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(runId)
}

export function runFilePaths(runId: string) {
  return {
    events: `logs/${runId}/events.ndjson`,
    commands: `logs/${runId}/commands.ndjson`,
    summary: `logs/${runId}/summary.json`,
    metadata: `logs/${runId}/metadata.json`,
  }
}

/** What a screenshot was taken for; part of its name, so a planet change and a breach on one tick keep both. */
export type ScreenshotTrigger = 'planet_change' | 'budget_breach'

/** Snapshot paths are relative to the run folder, as `snapshot_written.file` and the zip hold them. */
export function saveSnapshotFile(tick: number): string {
  return `snapshots/save-${tick}.json`
}

export function heapSnapshotFile(tick: number): string {
  return `heap/${tick}.heapsnapshot`
}

export function screenshotFile(tick: number, trigger: ScreenshotTrigger): string {
  return `shots/${tick}-${trigger}.png`
}

// Mirrored by SNAPSHOT_FILE_PATTERN in electron/snapshotFiles.cts (main cannot import this module).
const SNAPSHOT_FILE_PATTERN =
  /^(snapshots\/save-\d{1,15}\.json|heap\/\d{1,15}\.heapsnapshot|shots\/\d{1,15}-[a-z_]{1,32}\.png)$/

/** The snapshot paths the shell accepts: only the names above, so none can leave the run folder. */
export function isValidSnapshotFile(file: string): boolean {
  return SNAPSHOT_FILE_PATTERN.test(file)
}
