/**
 * Game sessions across commits (#125): the newest session of each source and world seed against
 * the newest one before it that ran another commit, as `compareRuns` tables them (decision #11
 * section 3, design doc section 26). Both summaries are derived from the logged events by
 * `deriveSummary`, as the game derives its own. Scenario and debug sessions are compared too, the
 * caller having said so (`compareRunsIncludingDebug`); differences are reported, never judged.
 */
import { compareRunsIncludingDebug, type RunComparison } from '../compareRuns'
import { deriveSummary } from '../runSummary'
import type { SessionLog } from './sessionTable'

export interface ComparedSession {
  runId: string
  commit: string
}

export interface SessionComparison {
  source: string
  worldSeed: number
  before: ComparedSession
  after: ComparedSession
  comparison: RunComparison
}

export function summaryComparisonsOf(sessions: readonly SessionLog[]): SessionComparison[] {
  const groups = groupBySourceAndSeed(sessions.filter(isGameSession).filter(hasWorldSeed))
  return [...groups.values()].flatMap(comparisonOfNewest)
}

type SeededSession = SessionLog & { worldSeed: number }

/** A run of the game, not a bench folder: it logged its start. */
function isGameSession(session: SessionLog): boolean {
  return session.events.some((event) => event.event === 'game_started')
}

/** Only a seed from `metadata.json` says two sessions played the same world. */
function hasWorldSeed(session: SessionLog): session is SeededSession {
  return session.worldSeed !== null
}

/** Sessions keep the table's oldest-first order inside each group. */
function groupBySourceAndSeed(sessions: readonly SeededSession[]): Map<string, SeededSession[]> {
  const groups = new Map<string, SeededSession[]>()
  for (const session of sessions) {
    const key = `${session.source}|${session.worldSeed}`
    groups.set(key, [...(groups.get(key) ?? []), session])
  }
  return groups
}

function comparisonOfNewest(sessions: readonly SeededSession[]): SessionComparison[] {
  const after = sessions[sessions.length - 1]
  const before = sessions.filter((session) => session.commit !== after.commit).at(-1)
  if (before === undefined) return []
  return [
    {
      source: after.source,
      worldSeed: after.worldSeed,
      before: { runId: before.runId, commit: before.commit },
      after: { runId: after.runId, commit: after.commit },
      comparison: compareRunsIncludingDebug(
        deriveSummary(before.events),
        deriveSummary(after.events),
      ),
    },
  ]
}
