// Rolls the ticket phase times of #134 up to the feature tree of the Features tab (#135). A
// feature's tickets are its `issues` plus every sub-issue of an umbrella it lists, followed down;
// a group's tickets are the union of its own and its children's. Each node counts a ticket once,
// however many paths reach it, so a shared ticket never doubles a total. A ticket with no
// docs/metrics/tickets file, or never claimed, is "not measured": counted, never added as zero time.
// Only each ticket's claimed-to-done window counts (#138): time before its first claim is left out,
// a block or planner wait after it is kept. Pure: the sub-issues come from the live issue list and
// the times from ticketTimeOverview's tickets.
import { zeroTotals } from '../metrics/phaseCategories.mjs'
import { medianOf } from './ticketTimeOverview.mjs'

// The median of one ticket is just its time, so the median needs this many.
export const MEDIAN_MIN_TICKETS = 2

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

function medianClaimedToDoneOf(measured) {
  if (measured.length < MEDIAN_MIN_TICKETS) return null
  return medianOf(measured.map((ticket) => ticket.claimedToDoneS))
}

/**
 * The claimed-to-done time of a set of ticket numbers: seconds per category and in all over the
 * measured tickets, the measured and not measured counts, and the median claimed-to-done time
 * from two measured tickets on. `measuredByNumber`: ticket number ->
 * `{ claimedTotals, claimedToDoneS }` (ticketTimeOverview's tickets).
 */
export function rollUpTicketTime(numbers, measuredByNumber) {
  const measured = [...numbers]
    .filter((n) => measuredByNumber.has(n))
    .map((n) => measuredByNumber.get(n))
  const totals = measured.reduce(
    (sum, ticket) => addTotals(sum, ticket.claimedTotals),
    zeroTotals(),
  )
  return {
    ticketCount: numbers.size,
    measuredCount: measured.length,
    unmeasuredCount: numbers.size - measured.length,
    measuredS: sumOf(totals),
    totals,
    medianClaimedToDoneS: medianClaimedToDoneOf(measured),
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

function isClaimed(ticket) {
  return ticket.claimedTotals !== null && ticket.claimedTotals !== undefined
}

/** Ticket number -> its measured ticket (one with a claim), from ticketTimeOverview's `tickets`. */
export function measuredByNumberOf(tickets) {
  return new Map(tickets.filter(isClaimed).map((ticket) => [ticket.ticket, ticket]))
}
