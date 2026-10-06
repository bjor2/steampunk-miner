// The status filter of /status/#issues (#194): which bucket an issue falls in, the issue's type and
// each bucket's order. Pure and import-free: the page loads this file as is (build-status.mjs copies
// it next to index.html), so the browser and the tests run the same rule.
//
// Ongoing, Ready to begin and Planned split the open issues between them: an open issue that is
// neither worked on nor ready is waiting on something, so it is planned.

export const BUCKETS = [
  { id: 'open', name: 'Open' },
  { id: 'ready', name: 'Ready to begin' },
  { id: 'ongoing', name: 'Ongoing' },
  { id: 'closed', name: 'Closed' },
  { id: 'planned', name: 'Planned' },
]
export const DEFAULT_BUCKET = 'ongoing'
const BUCKET_IDS = BUCKETS.map((bucket) => bucket.id)

// The labels the build loop never picks a ticket with (next-ticket.sh pick rule), besides
// in-progress, which makes the issue ongoing.
const WAITING_LABELS = ['blocked', 'on-hold', 'hitl', 'needs-planner']
const SPEC_LABELS = [
  'wayfinder:task',
  'wayfinder:research',
  'wayfinder:prototype',
  'wayfinder:grilling',
]
const BUILD_LABELS = ['build', 'perf']

/** The bucket id of a hash parameter, or the default for anything unknown. */
export function bucketIdOf(param) {
  return BUCKET_IDS.includes(param) ? param : DEFAULT_BUCKET
}

export function hasLabel(issue, name) {
  return issue.labels.some((label) => label.name === name)
}

function hasAnyLabel(issue, names) {
  return issue.labels.some((label) => names.includes(label.name))
}

export function isOpen(issue) {
  return issue.state === 'OPEN'
}

function hasSubIssues(issue) {
  return issue.children.length > 0
}

/** map / plan / spec / build, or null when the labels say none of them. */
export function issueTypeOf(issue) {
  if (hasLabel(issue, 'wayfinder:map')) return 'map'
  if (hasSubIssues(issue)) return 'plan'
  if (hasAnyLabel(issue, SPEC_LABELS)) return 'spec'
  if (hasAnyLabel(issue, BUILD_LABELS)) return 'build'
  return null
}

/** The labels that only say the type (the type chip shows it), left out of the label chips. */
export function isTypeLabel(label) {
  return BUILD_LABELS.includes(label.name) || label.name.startsWith('wayfinder:')
}

function hasOpenBlocker(issue) {
  return issue.blockedBy.some((blocker) => blocker.state === 'OPEN')
}

function hasOpenSubIssues(issue) {
  const summary = issue.summary ?? { total: 0, completed: 0 }
  return summary.completed < summary.total
}

function hasSpentAttempts(issue, loopFacts) {
  return (loopFacts.attempts[issue.number] ?? 0) >= loopFacts.maxAttempts
}

/** Worked on now: labelled in-progress, or a live loop worker or planner slot holds it. */
export function isOngoing(issue, claims) {
  return isOpen(issue) && (hasLabel(issue, 'in-progress') || claims.has(issue.number))
}

// Not ready while it waits on a label, an open dependency, its own open sub-issues (a plan or map)
// or a person after the loop spent its attempts.
function isWaiting(issue, loopFacts) {
  return (
    hasAnyLabel(issue, WAITING_LABELS) ||
    hasOpenBlocker(issue) ||
    hasOpenSubIssues(issue) ||
    hasSpentAttempts(issue, loopFacts)
  )
}

/**
 * closed / ongoing / planned / ready. `context`: `{ claims: Map<number, claim>, loopFacts:
 * { attempts: { [n]: count }, maxAttempts } }` (issueClaims.mjs).
 */
export function bucketOf(issue, context) {
  if (!isOpen(issue)) return 'closed'
  if (isOngoing(issue, context.claims)) return 'ongoing'
  if (isWaiting(issue, context.loopFacts)) return 'planned'
  return 'ready'
}

export function isInBucket(issue, bucketId, context) {
  if (bucketId === 'open') return isOpen(issue)
  return bucketOf(issue, context) === bucketId
}

/** `{ [bucket id]: issue count }` for every bucket. */
export function bucketCountsOf(issues, context) {
  const counts = Object.fromEntries(BUCKET_IDS.map((id) => [id, 0]))
  for (const issue of issues) {
    counts[bucketOf(issue, context)] += 1
    if (isOpen(issue)) counts.open += 1
  }
  return counts
}

function closedAtMs(issue) {
  return Date.parse(issue.closedAt ?? '') || 0
}

function byNewestClose(a, b) {
  return closedAtMs(b) - closedAtMs(a) || b.number - a.number
}

function byNumber(a, b) {
  return a.number - b.number
}

/** The issues of one bucket: closed ones newest closed first, the rest by number, as the loop picks. */
export function issuesInBucket(issues, bucketId, context) {
  const order = bucketId === 'closed' ? byNewestClose : byNumber
  return issues.filter((issue) => isInBucket(issue, bucketId, context)).sort(order)
}
