/**
 * The slices' report rows (#223) of every collected run log whose world seed is known: a session's
 * `metadata.json` names it, and bench folders and exported browser sessions have none.
 */
import { reportRowsOfRun, type PlanetReportRow } from '../reportRows'
import type { SessionLog } from './sessionTable'

export interface SessionReportRow extends PlanetReportRow {
  runId: string
  commit: string
  worldSeed: number
}

export function sessionReportRowsOf(sessions: readonly SessionLog[]): SessionReportRow[] {
  return sessions.flatMap(reportRowsOfSession)
}

function reportRowsOfSession({ runId, commit, worldSeed, events }: SessionLog): SessionReportRow[] {
  if (worldSeed === null) return []
  return reportRowsOfRun({ worldSeed, events }).map((row) => ({ runId, commit, worldSeed, ...row }))
}
