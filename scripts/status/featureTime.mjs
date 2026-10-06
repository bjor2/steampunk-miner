// Rolls the ticket phase times of #134 up to the feature tree of the Features tab (#135). A
// feature's tickets are its `issues` plus every sub-issue of an umbrella it lists, followed down;
// a group's tickets are the union of its own and its children's. Each node counts a ticket once,
// however many paths reach it, so a shared ticket never doubles a total. A ticket with no
// docs/metrics/tickets file is "not measured": counted, never added as zero time. Pure: the
// sub-issues come from the live issue list and the times from ticketTimeOverview's tickets.
import { zeroTotals } from '../metrics/phaseCategories.mjs'
import { medianOf } from './ticketTimeOverview.mjs'

// The median cycle time of one ticket says nothing about a feature, so it needs this many.
export const MEDIAN_CYCLE_MIN_TICKETS = 2

/** The issue numbers and every sub-issue under them, followed down; a loop is followed once. */
export function ticketsUnderIssues(numbers, subIssuesOf) {
  const found = new Set()
  const pending = [...numbers]
  while (pending.length) {
    const number = pending.pop()
    if (found.has(number)) continue
    found.add(number)
    pending.push(...(subIssuesOf.get(number) ?? []))
  }
  return found
}

/** Every ticket a feature or group reaches: its own issues and all its children's, each once. */
export function ticketsOfNode(node, subIssuesOf) {
  const tickets = ticketsUnderIssues(node.issues ?? [], subIssuesOf)
  for (const child of node.children ?? []) {
    for (const number of ticketsOfNode(child, subIssuesOf)) tickets.add(number)
  }
  return tickets
}

function addTotals(sum, totals) {
  for (const id of Object.keys(sum)) sum[id] += totals[id] ?? 0
  return sum
}

function sumOf(totals) {
  return Object.values(totals).reduce((sum, seconds) => sum + seconds, 0)
}

function medianCycleOf(measured) {
  if (measured.length < MEDIAN_CYCLE_MIN_TICKETS) return null
  return medianOf(measured.map((ticket) => ticket.cycleS))
}

/**
 * The time of a set of ticket numbers: seconds per category and in all over the measured tickets,
 * the measured and not measured counts, and the median cycle time from two measured tickets on.
 * `measuredByNumber`: ticket number -> `{ totals, cycleS }` (ticketTimeOverview's tickets).
 */
export function rollUpTicketTime(numbers, measuredByNumber) {
  const measured = [...numbers]
    .filter((n) => measuredByNumber.has(n))
    .map((n) => measuredByNumber.get(n))
  const totals = measured.reduce((sum, ticket) => addTotals(sum, ticket.totals), zeroTotals())
  return {
    ticketCount: numbers.size,
    measuredCount: measured.length,
    unmeasuredCount: numbers.size - measured.length,
    measuredS: sumOf(totals),
    totals,
    medianCycleS: medianCycleOf(measured),
  }
}

/** The roll-up of one feature or group node of docs/features/features.json. */
export function featureTimeOf(node, { subIssuesOf, measuredByNumber }) {
  return rollUpTicketTime(ticketsOfNode(node, subIssuesOf), measuredByNumber)
}

/** Sub-issue numbers per umbrella issue, from build-status's issue list (`children`). */
export function subIssuesOfIssues(issues) {
  return new Map(
    issues.filter((issue) => issue.children?.length).map((i) => [i.number, i.children]),
  )
}

/** Ticket number -> its measured ticket, from ticketTimeOverview's `tickets`. */
export function measuredByNumberOf(tickets) {
  return new Map(tickets.map((ticket) => [ticket.ticket, ticket]))
}
