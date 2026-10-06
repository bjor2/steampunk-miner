// The game feature tree of the status page's Features tab (docs/features/README.md). The data is
// the hand-edited docs/features/features.json; this module validates it and, at build time, joins
// each feature's linked issues with the live issue list so the page shows open/closed per issue and
// a "check" marker on features whose status looks out of date, and rolls the measured ticket
// times up to every feature and group (featureTime.mjs, #135). Pure functions, no I/O.
import { featureTimeOf, measuredByNumberOf, subIssuesOfIssues } from './featureTime.mjs'

export const STATUSES = ['built', 'partial', 'planned']

// Issues that record a decision, a question or a plan rather than the work itself. They are shown
// on a feature but never decide whether it looks shipped: a closed grilling issue only means the
// question was answered. Umbrella issues (with sub-issues) count as reference too.
const REFERENCE_LABELS = ['design']
const REFERENCE_LABEL_PREFIX = 'wayfinder:'
const PLACEHOLDER = /\b(TODO|TBD|placeholder|lorem|xxx)\b/i
const KNOWN_KEYS = new Set([
  'group',
  'title',
  'description',
  'status',
  'issues',
  'planet',
  'doc',
  'children',
  'ignoreSync',
])

/** Every problem in the feature file as a readable line; an empty list means it is valid. */
export function validateFeatures(doc) {
  const problems = []
  if (!doc || typeof doc !== 'object') return ['the file is not a JSON object']
  if (!Array.isArray(doc.areas) || doc.areas.length === 0) problems.push('"areas" must be a list')
  const visit = (node, path) => {
    const where = path.join(' › ') || '(root)'
    for (const key of Object.keys(node)) {
      if (!KNOWN_KEYS.has(key)) problems.push(`unknown key "${key}" at ${where}`)
    }
    for (const key of ['title', 'description']) {
      const text = node[key]
      if (typeof text !== 'string' || !text.trim()) problems.push(`empty ${key} at ${where}`)
      else if (PLACEHOLDER.test(text)) problems.push(`placeholder ${key} at ${where}: ${text}`)
    }
    const children = node.children ?? []
    if (!Array.isArray(children)) problems.push(`"children" must be a list at ${where}`)
    if (node.group) {
      if (!children.length) problems.push(`group without children at ${where}`)
      if (node.status !== undefined) problems.push(`a group has no status, at ${where}`)
    } else if (!STATUSES.includes(node.status)) {
      problems.push(`status must be one of ${STATUSES.join(' | ')} at ${where}`)
    } else if (node.status !== 'built' && !(node.issues?.length || node.doc)) {
      problems.push(`a ${node.status} feature needs an issue or a doc at ${where}`)
    }
    if (node.issues !== undefined) {
      const ok =
        Array.isArray(node.issues) && node.issues.every((n) => Number.isInteger(n) && n > 0)
      if (!ok) problems.push(`"issues" must be a list of issue numbers at ${where}`)
    }
    if (node.planet !== undefined && !(Number.isInteger(node.planet) && node.planet > 0)) {
      problems.push(`"planet" must be a planet number at ${where}`)
    }
    if (Array.isArray(children)) {
      for (const child of children) visit(child, [...path, child?.title ?? '?'])
    }
  }
  for (const area of Array.isArray(doc.areas) ? doc.areas : []) {
    if (!area.group) problems.push(`top-level area "${area.title}" must be a group`)
    visit(area, [area.title ?? '?'])
  }
  return problems
}

function isReferenceIssue(issue) {
  if (issue.children?.length) return true
  return issue.labels.some(
    (l) => l.name.startsWith(REFERENCE_LABEL_PREFIX) || REFERENCE_LABELS.includes(l.name),
  )
}

/**
 * Why a feature's status looks out of date against its linked issues, or null. Only work issues
 * count (see REFERENCE_LABELS); a feature linked to reference issues alone is never flagged.
 */
export function syncCheckOf(node, issuesByNumber) {
  if (node.group || !node.issues?.length || node.ignoreSync) return null
  const missing = node.issues.filter((n) => !issuesByNumber.has(n))
  if (missing.length) return `linked issue ${missing.map((n) => '#' + n).join(' ')} not found`
  const work = node.issues.map((n) => issuesByNumber.get(n)).filter((i) => !isReferenceIssue(i))
  if (!work.length) return null
  const done = work.filter((i) => i.state !== 'OPEN' && i.stateReason !== 'NOT_PLANNED')
  const dropped = work.filter((i) => i.stateReason === 'NOT_PLANNED')
  const open = work.filter((i) => i.state === 'OPEN')
  const list = (xs) => xs.map((i) => '#' + i.number).join(' ')
  if (node.status !== 'built' && !open.length && done.length) {
    return `marked ${node.status}, but its work issues are all closed (${list(done)}): built now?`
  }
  if (node.status !== 'built' && !open.length && dropped.length) {
    return `marked ${node.status}, but its work issues were closed as not planned (${list(dropped)})`
  }
  if (node.status === 'built' && open.length === work.length) {
    return `marked built, but its work issues are all still open (${list(open)})`
  }
  return null
}

/**
 * The feature file joined with the live issues, for the page: each node gets `sync` (a check
 * reason or null) and `time` (its tickets' roll-up from `measuredTickets`, ticketTimeOverview's
 * `tickets`), plus the issue states the page shows, the counts it puts in the header and `time`
 * over the whole tree.
 */
export function annotateFeatures(doc, issues, measuredTickets = []) {
  const byNumber = new Map(issues.map((i) => [i.number, i]))
  const timeSources = {
    subIssuesOf: subIssuesOfIssues(issues),
    measuredByNumber: measuredByNumberOf(measuredTickets),
  }
  const linked = new Set()
  const counts = { features: 0, built: 0, partial: 0, planned: 0, flagged: 0 }
  const flagged = []
  const annotate = (node, path) => {
    const out = { ...node, time: featureTimeOf(node, timeSources) }
    for (const n of node.issues ?? []) linked.add(n)
    if (!node.group) {
      counts.features++
      counts[node.status]++
      out.sync = syncCheckOf(node, byNumber)
      if (out.sync) {
        counts.flagged++
        flagged.push({ path: [...path, node.title].join(' › '), reason: out.sync })
      }
    }
    if (node.children) out.children = node.children.map((c) => annotate(c, [...path, node.title]))
    return out
  }
  const areas = doc.areas.map((a) => annotate(a, []))
  const issueStates = {}
  for (const n of [...linked].sort((a, b) => a - b)) {
    const i = byNumber.get(n)
    if (i) issueStates[n] = { title: i.title, state: i.state, reason: i.stateReason ?? null }
  }
  const time = featureTimeOf({ children: doc.areas }, timeSources)
  return { ...doc, areas, issues: issueStates, counts, flagged, time }
}
