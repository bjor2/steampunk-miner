/**
 * The known-red verdict (TD on #396, section 2; ticket 419): a marked gate still runs in full and
 * prints every problem with its finding number, but only the problems the marker covers may pass,
 * and only while the finding is open and the gate is actually red. Everything else fails.
 */
import type { KnownRedMarker } from '../constants/knownRed'

/** A gate's problems split by the marker's reach. */
export interface KnownRedProblems {
  /** Problems the marker may hold as known red (for `campaignPacingGate`: stalled seeds, sawtooth). */
  readonly covered: readonly string[]
  /** Problems that fail whatever the marker says. */
  readonly uncovered: readonly string[]
}

export interface KnownRedVerdict {
  /** Every problem that fails the gate; empty when the gate passes. */
  readonly failures: string[]
  /** The covered problems held as known red, each with its finding number. */
  readonly knownRed: string[]
}

/** The finding ticket's metrics file (`docs/metrics/tickets/<n>.json`) as text, or null if none. */
export type FindingTicketFileReader = (finding: number) => string | null

export function knownRedVerdict(
  marker: KnownRedMarker | null,
  problems: KnownRedProblems,
  readFindingTicketFile: FindingTicketFileReader,
): KnownRedVerdict {
  if (marker === null) return failingEverything(null, problems)
  const refusal = markerRefusalOf(marker, problems, readFindingTicketFile)
  return refusal === null
    ? holdingCoveredAsKnownRed(marker, problems)
    : failingEverything(refusal, problems)
}

/** Why the marker cannot hold anything, or null when it is active and the gate is red. */
function markerRefusalOf(
  marker: KnownRedMarker,
  problems: KnownRedProblems,
  readFindingTicketFile: FindingTicketFileReader,
): string | null {
  if (!isTicketed(marker)) return 'known-red marker has no finding ticket'
  const closedOn = findingClosedOnIn(readFindingTicketFile(marker.finding))
  if (closedOn !== null) return expiredMarkerProblem(marker.finding, closedOn)
  if (problems.covered.length === 0) return greenGateProblem(marker.finding)
  return null
}

function isTicketed(marker: KnownRedMarker): boolean {
  return Number.isSafeInteger(marker.finding) && marker.finding > 0 && marker.reason.trim() !== ''
}

/** The loop writes the metrics file when it closes a ticket ("Record phase times for ticket N"). */
export function findingClosedOnIn(ticketFile: string | null): string | null {
  if (ticketFile === null) return null
  const closed = (JSON.parse(ticketFile) as { closed?: string | null }).closed
  return closed ?? null
}

function expiredMarkerProblem(finding: number, closedOn: string): string {
  return `known-red marker for #${finding} expired: the finding closed on ${closedOn}; delete the marker (the gate must be green) or file a new finding`
}

/** The ratchet: a marker cannot outlive the red it was filed for. */
function greenGateProblem(finding: number): string {
  return `campaignPacingGate is green but still marked known-red for #${finding}: delete the marker`
}

function failingEverything(refusal: string | null, problems: KnownRedProblems): KnownRedVerdict {
  const marked = refusal === null ? [] : [refusal]
  return { failures: [...marked, ...problems.covered, ...problems.uncovered], knownRed: [] }
}

function holdingCoveredAsKnownRed(
  marker: KnownRedMarker,
  problems: KnownRedProblems,
): KnownRedVerdict {
  return {
    failures: [...problems.uncovered],
    knownRed: problems.covered.map((problem) => `known-red (#${marker.finding}): ${problem}`),
  }
}
