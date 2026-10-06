// The GitHub side of the ticket phases (#134): when a ticket waited on planners or was blocked.
// Pure: the issue's timeline events (`gh api repos/<repo>/issues/<n>/timeline`) and the open
// interval of each blocking issue in, windows `{ category, start, end, source }` out (epoch ms;
// `end` is Infinity while still open, the ticket's close clips it later).
//
// A blocker counts from its creation to its last close; a reopened blocker is not followed.

const PLANNER_LABEL = 'needs-planner'
const BLOCKED_LABEL = 'blocked'

function byTime(timeline) {
  return [...timeline].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

/** Open intervals keyed by `keyOf(event)`: `opens` starts one, `closes` ends it. */
function intervalsOf(events, { opens, closes, keyOf }) {
  const open = new Map()
  const intervals = []
  for (const event of events) {
    const key = keyOf(event)
    const at = Date.parse(event.created_at)
    if (event.event === opens && !open.has(key)) open.set(key, { key, start: at })
    if (event.event === closes && open.has(key)) {
      intervals.push({ ...open.get(key), end: at })
      open.delete(key)
    }
  }
  return [...intervals, ...[...open.values()].map((interval) => ({ ...interval, end: Infinity }))]
}

function labelIntervals(events, name) {
  const labelEvents = events.filter((event) => event.label?.name === name)
  return intervalsOf(labelEvents, { opens: 'labeled', closes: 'unlabeled', keyOf: () => name })
}

function dependencyIntervals(events) {
  const dependencyEvents = events.filter((event) => event.blocked_by?.number !== undefined)
  return intervalsOf(dependencyEvents, {
    opens: 'blocked_by_added',
    closes: 'blocked_by_removed',
    keyOf: (event) => event.blocked_by.number,
  })
}

function openSpanOf(blocker) {
  const closedAt = blocker.closedAt ? Date.parse(blocker.closedAt) : Infinity
  return { start: Date.parse(blocker.createdAt), end: closedAt }
}

// The part of a dependency during which its blocker was open; none for an unknown blocker.
function whileBlockerOpen(interval, blockers) {
  const blocker = blockers.get(interval.key)
  if (!blocker) return null
  const span = openSpanOf(blocker)
  const start = Math.max(interval.start, span.start)
  const end = Math.min(interval.end, span.end)
  return end > start ? { start, end } : null
}

function byStart(intervals) {
  return [...intervals].sort((a, b) => a.start - b.start)
}

function windowOf(category, interval) {
  return { category, start: interval.start, end: interval.end, source: 'github' }
}

/**
 * `timeline`: the issue's timeline events. `blockers`: Map of blocking issue number ->
 * `{ createdAt, closedAt }` (ISO; closedAt null while open).
 */
export function githubWindows(timeline, blockers) {
  const events = byTime(timeline)
  const plannerWaits = labelIntervals(events, PLANNER_LABEL)
  const blockedLabels = labelIntervals(events, BLOCKED_LABEL)
  const dependencies = dependencyIntervals(events)
    .map((interval) => whileBlockerOpen(interval, blockers))
    .filter(Boolean)
  return [
    ...byStart(plannerWaits).map((interval) => windowOf('planner_wait', interval)),
    ...byStart([...blockedLabels, ...dependencies]).map((interval) =>
      windowOf('blocked', interval),
    ),
  ]
}

/** The numbers of every issue the timeline ever named as blocking this one. */
export function blockerNumbersOf(timeline) {
  const numbers = timeline
    .filter((event) => event.event === 'blocked_by_added')
    .map((event) => event.blocked_by?.number)
  return [...new Set(numbers.filter(Number.isInteger))]
}
