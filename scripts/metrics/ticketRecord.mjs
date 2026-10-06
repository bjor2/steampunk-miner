// One ticket's time from creation to close as a single timeline of phase segments (#134), the
// shape committed under docs/metrics/tickets/<n>.json. Pure: the issue, the loop's attempts (one
// per session log), the matched transcripts, the driver log events and the GitHub windows in.
//
// Every source becomes windows with a rank; where windows overlap the lower rank owns the time,
// and time no window covers is idle (open, unblocked and in no session). Ranks, highest first:
// what the transcript says a session did, the rest of a session's span (other), the loop's gates
// after a session, the landing, waiting on planners, blocked.
import { TICKET_PHASES_SCHEMA, zeroTotals } from './phaseCategories.mjs'

const RANKS = { transcript: 0, session: 1, gates: 2, landing: 3, planner_wait: 4, blocked: 5 }
// The driver logs the tier a few seconds after the session log is created, in whole minutes.
const TIER_LINE_SLACK_MS = 5 * 60_000
const MATCH_SLACK_MS = 60_000
const TIER_LABEL_PREFIX = 'tier:'

function windowOf(category, start, end, source, rank) {
  return { category, start, end, source, rank }
}

/** Covering windows -> one timeline over [from, to]; each piece goes to its best-ranked window. */
export function layerWindows(windows, from, to) {
  const inside = windows.filter((w) => w.end > from && w.start < to)
  const cuts = [...new Set([from, to, ...inside.flatMap((w) => [w.start, w.end])])]
    .filter((cut) => cut >= from && cut <= to)
    .sort((a, b) => a - b)
  const ranked = [...inside].sort((a, b) => a.rank - b.rank)
  const pieces = []
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    pieces.push(pieceBetween(ranked, cuts[index], cuts[index + 1]))
  }
  return mergeTouching(pieces, (a, b) => a.category === b.category && a.source === b.source)
}

function pieceBetween(ranked, start, end) {
  const owner = ranked.find((w) => w.start <= start && w.end >= end)
  if (!owner) return { category: 'idle', start, end, source: 'derived' }
  return { category: owner.category, start, end, source: owner.source }
}

function mergeTouching(pieces, isSameKind) {
  const merged = []
  for (const piece of pieces) {
    const last = merged.at(-1)
    if (last && last.end === piece.start && isSameKind(last, piece)) last.end = piece.end
    else merged.push({ ...piece })
  }
  return merged
}

function isSessionOfAttempt(session, attempt) {
  if (attempt.sessionId) return session.sessionId === attempt.sessionId
  return session.start >= attempt.start - MATCH_SLACK_MS && session.start <= attempt.end
}

function tierAt(driverEvents, start) {
  const tiers = driverEvents.filter((e) => e.kind === 'tier' && e.at <= start + TIER_LINE_SLACK_MS)
  return tiers.at(-1) ?? null
}

function attemptOfLog(log, sessions) {
  return { ...log, session: sessions.find((s) => isSessionOfAttempt(s, log)) ?? null }
}

function attemptOfLonelySession(session) {
  return { start: session.start, end: session.end, gatesEnd: null, session }
}

function numberAttempt(attempt, number, driverEvents) {
  const tier = tierAt(driverEvents, attempt.start)
  return {
    ...attempt,
    number,
    tier: tier?.tier ?? null,
    model: attempt.session?.model ?? tier?.model ?? null,
  }
}

/** One attempt per session log, plus one per transcript no log claims; numbered from 1. */
function attemptsOf(logs, sessions, driverEvents) {
  const fromLogs = logs.map((log) => attemptOfLog(log, sessions))
  const claimed = new Set(fromLogs.map((attempt) => attempt.session).filter(Boolean))
  const lonely = sessions.filter((s) => !claimed.has(s)).map(attemptOfLonelySession)
  return [...fromLogs, ...lonely]
    .sort((a, b) => a.start - b.start)
    .map((attempt, index) => numberAttempt(attempt, index + 1, driverEvents))
}

function sessionWindowsOf(attempt) {
  const transcript = (attempt.session?.segments ?? []).map((s) =>
    windowOf(s.category, s.start, s.end, 'transcript', RANKS.transcript),
  )
  const span = windowOf('other', attempt.start, attempt.end, 'loop-log', RANKS.session)
  return [...transcript, span]
}

function gatesEndOf(attempt, driverEvents, nextStart) {
  if (attempt.gatesEnd !== null && attempt.gatesEnd !== undefined) return attempt.gatesEnd
  const verdict = driverEvents.find(
    (e) => e.kind === 'gates-end' && e.at > attempt.end && e.at < nextStart,
  )
  return verdict?.at ?? null
}

function gatesWindowsOf(attempts, driverEvents) {
  return attempts.flatMap((attempt, index) => {
    const nextStart = attempts[index + 1]?.start ?? Infinity
    const end = gatesEndOf(attempt, driverEvents, nextStart)
    return end !== null && end > attempt.end
      ? [windowOf('gates', attempt.end, end, 'loop-log', RANKS.gates)]
      : []
  })
}

// A landing runs from its start to the next failed rebase or push, else until the close.
function landingWindowsOf(driverEvents) {
  return driverEvents
    .filter((e) => e.kind === 'landing-start')
    .map((start) => {
      const stop = driverEvents.find((e) => e.kind === 'landing-stop' && e.at >= start.at)
      return windowOf('landing', start.at, stop?.at ?? Infinity, 'loop-log', RANKS.landing)
    })
}

function rankedGithubWindows(githubWindows) {
  return githubWindows.map((w) => ({ ...w, rank: RANKS[w.category] }))
}

function attemptStampAt(attempts, at) {
  const attempt = attempts.filter((a) => a.start <= at).at(-1)
  if (!attempt) return { attempt: 0, tier: null, model: null }
  return { attempt: attempt.number, tier: attempt.tier, model: attempt.model }
}

function segmentOf(piece, attempts) {
  return {
    category: piece.category,
    start: new Date(piece.start).toISOString(),
    end: new Date(piece.end).toISOString(),
    ...attemptStampAt(attempts, piece.start),
    source: piece.source,
  }
}

function totalsOf(pieces) {
  const ms = zeroTotals()
  for (const piece of pieces) ms[piece.category] += piece.end - piece.start
  return Object.fromEntries(Object.entries(ms).map(([id, value]) => [id, Math.round(value / 1000)]))
}

function tierOf(labels, attempts) {
  const label = labels.find((name) => name.startsWith(TIER_LABEL_PREFIX))
  return label ? label.slice(TIER_LABEL_PREFIX.length) : (attempts.at(-1)?.tier ?? null)
}

function secondsBetween(start, end) {
  return Math.round((end - start) / 1000)
}

function cycleTimeOf(attempts, created, closed) {
  if (attempts.length === 0) return null
  return secondsBetween(Math.max(attempts[0].start, created), closed)
}

function windowsOf({ attempts, driverEvents, githubWindows }) {
  return [
    ...attempts.flatMap(sessionWindowsOf),
    ...gatesWindowsOf(attempts, driverEvents),
    ...landingWindowsOf(driverEvents),
    ...rankedGithubWindows(githubWindows),
  ]
}

/**
 * `issue`: `{ number, title, createdAt, closedAt, labels: [name] }`; `attempts`: the session logs
 * `[{ start, end, gatesEnd, sessionId }]` (epoch ms; gatesEnd from the gate files, null if gone);
 * `sessions`: `segmentSession` results of the ticket's transcripts; `driverEvents`: this ticket's
 * `parseDriverLog` events; `githubWindows`: `githubWindows(...)` of its timeline.
 */
export function buildTicketRecord({
  issue,
  attempts,
  sessions,
  driverEvents,
  githubWindows,
  backfilled,
}) {
  const created = Date.parse(issue.createdAt)
  const closed = Date.parse(issue.closedAt)
  const numbered = attemptsOf(attempts, sessions, driverEvents)
  const pieces = layerWindows(
    windowsOf({ attempts: numbered, driverEvents, githubWindows }),
    created,
    closed,
  )
  return {
    schema: TICKET_PHASES_SCHEMA,
    ticket: issue.number,
    title: issue.title,
    tier: tierOf(issue.labels, numbered),
    model: numbered.at(-1)?.model ?? null,
    created: issue.createdAt,
    closed: issue.closedAt,
    segments: mergeTouching(
      pieces.map((piece) => segmentOf(piece, numbered)),
      (a, b) => a.category === b.category && a.source === b.source && a.attempt === b.attempt,
    ),
    totals: totalsOf(pieces),
    lead_time_s: secondsBetween(created, closed),
    cycle_time_s: cycleTimeOf(numbered, created, closed),
    backfilled,
  }
}
