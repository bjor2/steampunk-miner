// The model behind "Tickets closed over time" at the top of /status/#features (#138): the build
// and perf tickets closed each UTC day, from the first close to today, with the running total,
// and the median claimed-to-done time of the measured tickets closed that day. The closes come
// from the GitHub issue list build-status.mjs already fetches, so every closed ticket counts, with
// or without a metrics file; the medians come from the committed docs/metrics/tickets files.
// Pure: `today` is passed in.
import { medianOf } from './ticketTimeOverview.mjs'

/** A closed issue with one of these labels is a ticket; `gh issue list --state closed` counts it. */
export const TICKET_LABELS = ['build', 'perf']
const DAY_LENGTH = 'YYYY-MM-DD'.length
const DAY_MS = 86_400_000

function isTicket(issue) {
  return issue.labels.some((label) => TICKET_LABELS.includes(label.name))
}

function isClosedTicket(issue) {
  return issue.state === 'CLOSED' && typeof issue.closedAt === 'string' && isTicket(issue)
}

function dayOfStamp(stamp) {
  return stamp.slice(0, DAY_LENGTH)
}

/** Every UTC day from `first` to `last`, both included, as `YYYY-MM-DD`. */
export function daysFromTo(first, last) {
  const days = []
  for (let at = Date.parse(first); at <= Date.parse(last); at += DAY_MS) {
    days.push(new Date(at).toISOString().slice(0, DAY_LENGTH))
  }
  return days
}

function groupedByDay(items, dayOf) {
  const byDay = new Map()
  for (const item of items) {
    const day = dayOf(item)
    byDay.set(day, [...(byDay.get(day) ?? []), item])
  }
  return byDay
}

function isMeasured(ticket) {
  return Number.isFinite(ticket.claimedToDoneS)
}

function laterDayOf(a, b) {
  return a > b ? a : b
}

// From the first close to today; never short of a close stamped after the build box's today.
function axisOf(closed, measured, today) {
  const days = [...closed.map((i) => i.closedAt), ...measured.map((t) => t.closed)]
    .map(dayOfStamp)
    .sort()
  if (days.length === 0) return []
  return daysFromTo(days[0], laterDayOf(days.at(-1), today))
}

function ticketLineOf(issue) {
  return { number: issue.number, title: issue.title }
}

function dayRowsOf(axis, closedByDay, measuredByDay) {
  let cumulative = 0
  return axis.map((day) => {
    const closed = closedByDay.get(day) ?? []
    const measured = measuredByDay.get(day) ?? []
    cumulative += closed.length
    return {
      day,
      count: closed.length,
      cumulative,
      tickets: [...closed].sort((a, b) => a.number - b.number).map(ticketLineOf),
      measuredCount: measured.length,
      medianClaimedToDoneS: medianOf(measured.map((ticket) => ticket.claimedToDoneS)),
    }
  })
}

/**
 * `issues`: build-status's issue list (`{ number, title, state, closedAt, labels: [{ name }] }`);
 * `measuredTickets`: ticketTimeOverview's `tickets`; `today`: `YYYY-MM-DD` (UTC).
 */
export function buildTicketsClosedOverTime({ issues, measuredTickets, today }) {
  const closed = issues.filter(isClosedTicket)
  const measured = measuredTickets.filter(isMeasured)
  const days = dayRowsOf(
    axisOf(closed, measured, today),
    groupedByDay(closed, (issue) => dayOfStamp(issue.closedAt)),
    groupedByDay(measured, (ticket) => dayOfStamp(ticket.closed)),
  )
  return { closedCount: closed.length, measuredCount: measured.length, days }
}
