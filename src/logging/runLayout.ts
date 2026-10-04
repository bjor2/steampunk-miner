/**
 * Where a run's files live (design doc section 23):
 *   logs/<runId>/events.ndjson | summary.json | metadata.json
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
    summary: `logs/${runId}/summary.json`,
    metadata: `logs/${runId}/metadata.json`,
  }
}
