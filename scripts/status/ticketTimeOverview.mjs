// The model behind the "Where the time goes" section of /status/#issues (#134): the committed
// ticket phase files (docs/metrics/tickets/*.json) as the last closed tickets' breakdowns, the
// category totals per close day and the median cycle and lead time per close day. Pure: no fs, no
// clock, so the Pages job (no transcripts there) and the tests feed it the same file texts. The
// breakdowns and totals count only each ticket's claimed-to-done window (#138 for the Features
// tab, #167 here): days blocked before anyone picked a ticket up drowned out the work. The
// Features tab rolls the same tickets up per feature (featureTime.mjs, #135).
import { claimedWindowTotals } from '../metrics/claimedWindow.mjs'
import { PHASE_CATEGORIES, TICKET_PHASES_SCHEMA, zeroTotals } from '../metrics/phaseCategories.mjs'

export const RECENT_TICKET_COUNT = 30
const DAY_LENGTH = 'YYYY-MM-DD'.length

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function problemOfRecord(record) {
  if (!isRecord(record)) return 'not a JSON object'
  if (record.schema !== TICKET_PHASES_SCHEMA) {
    return `schema ${record.schema} is not ${TICKET_PHASES_SCHEMA}`
  }
  if (!Number.isInteger(record.ticket)) return 'missing ticket number'
  if (!Number.isFinite(Date.parse(record.closed))) return 'missing or unreadable closed'
  if (!isRecord(record.totals)) return 'missing totals'
  return null
}

function recordOfFile(file, problems) {
  let record
  try {
    record = JSON.parse(file.text)
  } catch {
    problems.push(`${file.name}: invalid JSON, skipped`)
    return null
  }
  const problem = problemOfRecord(record)
  if (problem) {
    problems.push(`${file.name}: ${problem}, skipped`)
    return null
  }
  return record
}

function secondsOrNull(value) {
  return Number.isFinite(value) ? value : null
}

function fullTotalsOf(totals) {
  const full = zeroTotals()
  for (const id of Object.keys(full)) full[id] = Number.isFinite(totals[id]) ? totals[id] : 0
  return full
}

function claimedOf(record) {
  return Number.isFinite(Date.parse(record.claimed)) ? record.claimed : null
}

function segmentsOf(record) {
  return Array.isArray(record.segments) ? record.segments : []
}

// A ticket never claimed (closed with no session) has no window: the Features tab leaves it
// unmeasured.
function claimedTotalsOf(record) {
  const claimed = claimedOf(record)
  return claimed ? claimedWindowTotals(segmentsOf(record), claimed, record.closed) : null
}

function ticketOf(record, repo) {
  return {
    ticket: record.ticket,
    title: typeof record.title === 'string' ? record.title : '',
    url: `https://github.com/${repo}/issues/${record.ticket}`,
    closed: record.closed,
    closedMs: Date.parse(record.closed),
    tier: typeof record.tier === 'string' ? record.tier : null,
    totals: fullTotalsOf(record.totals),
    leadS: secondsOrNull(record.lead_time_s),
    cycleS: secondsOrNull(record.cycle_time_s),
    claimed: claimedOf(record),
    claimedToDoneS: secondsOrNull(record.claimed_to_done_s),
    claimedTotals: claimedTotalsOf(record),
    backfilled: record.backfilled === true,
  }
}

function addTotals(sum, totals) {
  for (const id of Object.keys(sum)) sum[id] += totals[id]
  return sum
}

/** The median of the finite values, or null with none. */
export function medianOf(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function isUnclaimed(ticket) {
  return ticket.claimedTotals === null
}

// A ticket with no claim (an old backfill) has no window, so it adds nothing rather than all of
// its time.
function claimedTotalsSumOf(tickets) {
  return tickets
    .filter((ticket) => !isUnclaimed(ticket))
    .reduce((sum, ticket) => addTotals(sum, ticket.claimedTotals), zeroTotals())
}

function unclaimedCountOf(tickets) {
  return tickets.filter(isUnclaimed).length
}

function dayOf(day, tickets) {
  return {
    day,
    ticketCount: tickets.length,
    unclaimedCount: unclaimedCountOf(tickets),
    totals: claimedTotalsSumOf(tickets),
    medianCycleS: medianOf(tickets.map((ticket) => ticket.cycleS)),
    medianLeadS: medianOf(tickets.map((ticket) => ticket.leadS)),
  }
}

// Close days in UTC, so the page reads the same wherever it is built.
function daysOf(tickets) {
  const byDay = new Map()
  for (const ticket of tickets) {
    const day = ticket.closed.slice(0, DAY_LENGTH)
    byDay.set(day, [...(byDay.get(day) ?? []), ticket])
  }
  return [...byDay.keys()].sort().map((day) => dayOf(day, byDay.get(day)))
}

function newestFirst(tickets) {
  return [...tickets].sort((a, b) => b.closedMs - a.closedMs || b.ticket - a.ticket)
}

/** `files`: `[{ name, text }]` of docs/metrics/tickets/; `repo`: `owner/name` for issue links. */
export function buildTicketTimeOverview({ files, repo }) {
  const problems = []
  const tickets = files
    .map((file) => recordOfFile(file, problems))
    .filter(Boolean)
    .map((record) => ticketOf(record, repo))
  return {
    repo,
    categories: PHASE_CATEGORIES,
    ticketCount: tickets.length,
    unclaimedCount: unclaimedCountOf(tickets),
    categoryTotals: claimedTotalsSumOf(tickets),
    recent: newestFirst(tickets).slice(0, RECENT_TICKET_COUNT),
    days: daysOf(tickets),
    // Every measured ticket, for the feature roll-up of the Features tab (featureTime.mjs, #135).
    tickets,
    problems,
  }
}
