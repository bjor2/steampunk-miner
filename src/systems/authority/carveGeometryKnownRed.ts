/**
 * The three named deviations of ticket 537's carve-geometry landing bars (the GD's ruling after
 * the prototype round 6241320435 item 2, VS 6241318671 item 2), held as known red under #545, the
 * paid-cell rule on the report path that owns them and their expiry: on the fixed-track lane
 * (`digSpeedTrack.lane.test.ts`) the floor against the 5 m/s rig at 3 m/s flat level reads 0.984,
 * and cells per metre at 25 and 44 m/s tilted down read 1.079. The rule is `logging/knownRed.ts`'s
 * (TD on #396 section 2, ticket 419), local to the lane: a marked row still runs in full and prints
 * its reading with the finding number, only the named bar of a named row may be held, and only
 * while #545 is open and the row is actually red; any other red hard bar fails, and so does a named
 * row that turned green (delete its deviation) or a closed #545 (the marker expired). No report
 * calls a held row a pass. Spec support; it reads, never writes.
 */
import type { KnownRedMarker } from '../../constants/knownRed'
import type { GeometryMisses } from './lawWorkFixtures'

/** The finding ticket's metrics file (`docs/metrics/tickets/<n>.json`) as text, or null if none. */
export type FindingTicketFileReader = (finding: number) => string | null

/** Local to the lane, as `exactCarry.lane`'s is: the repo's one exported marker is ticket 419's. */
const CARVE_GEOMETRY_MARKER: KnownRedMarker = {
  finding: 545,
  reason:
    'the report capsule removes by falloff weight where swept clears every crossed cell in full, so three fixed-track rows miss the carve-geometry bars until the paid-cell rule on the report path (#545)',
}

/** The bar a deviation is held on: the columns of `GeometryMisses`. */
export type GeometryBar = keyof GeometryMisses

/** One named deviation: the row, the bar it misses, and the reading the ruling named. */
export interface CarveGeometryDeviation {
  readonly track: string
  readonly bar: GeometryBar
  readonly reads: number
}

export const CARVE_GEOMETRY_DEVIATIONS: readonly CarveGeometryDeviation[] = [
  { track: '3 m/s flat level', bar: 'lawWorkPerMetre', reads: 0.984 },
  { track: '25 m/s tilted down', bar: 'cellsPerMetre', reads: 1.079 },
  { track: '44 m/s tilted down', bar: 'cellsPerMetre', reads: 1.079 },
]

/** What the lane says of one row: the failures, and the misses held as known red, printed. */
export interface CarveGeometryVerdict {
  readonly failures: string[]
  readonly knownRed: string[]
}

/** The verdict on one row's misses against the floor rig (`geometryMissesAgainst`, 0 inside the band). */
export function carveGeometryVerdictOf(
  track: string,
  misses: GeometryMisses,
  readFindingTicketFile: FindingTicketFileReader,
): CarveGeometryVerdict {
  const closedOn = closedOnIn(readFindingTicketFile(CARVE_GEOMETRY_MARKER.finding))
  const problems = problemsOf(track, misses)
  if (closedOn !== null) {
    return { failures: [expiredProblemOf(closedOn), ...problems.map(textOf)], knownRed: [] }
  }
  const held = problems.filter((problem) => isNamedDeviation(track, problem.bar))
  const failures = problems.filter((problem) => !isNamedDeviation(track, problem.bar))
  return {
    failures: [...failures.map(textOf), ...greenDeviationProblemsOf(track, misses)],
    knownRed: held.map(
      (problem) => `known-red (#${CARVE_GEOMETRY_MARKER.finding}): ${textOf(problem)}`,
    ),
  }
}

interface BarProblem {
  track: string
  bar: GeometryBar
  miss: number
}

function problemsOf(track: string, misses: GeometryMisses): BarProblem[] {
  return (Object.keys(misses) as GeometryBar[])
    .filter((bar) => misses[bar] > 0)
    .map((bar) => ({ track, bar, miss: misses[bar] }))
}

function isNamedDeviation(track: string, bar: GeometryBar): boolean {
  return CARVE_GEOMETRY_DEVIATIONS.some((named) => named.track === track && named.bar === bar)
}

/** The ratchet: a deviation cannot outlive the red it was filed for. */
function greenDeviationProblemsOf(track: string, misses: GeometryMisses): string[] {
  return CARVE_GEOMETRY_DEVIATIONS.filter(
    (named) => named.track === track && misses[named.bar] === 0,
  ).map(
    (named) =>
      `${track} ${named.bar} is inside the band but still a named deviation under #${CARVE_GEOMETRY_MARKER.finding}: delete it`,
  )
}

function textOf({ track, bar, miss }: BarProblem): string {
  return `${track} ${bar} misses the band against the 5 m/s rig by ${miss}`
}

/**
 * The loop writes the metrics file when it closes a ticket ("Record phase times for ticket N"),
 * as `logging/knownRed.ts` reads it; read here again because `systems/` imports nothing above it.
 */
function closedOnIn(ticketFile: string | null): string | null {
  if (ticketFile === null) return null
  const closed = (JSON.parse(ticketFile) as { closed?: string | null }).closed
  return closed ?? null
}

function expiredProblemOf(closedOn: string): string {
  return `known-red marker for #${CARVE_GEOMETRY_MARKER.finding} expired: the finding closed on ${closedOn}; delete the deviations (the bars must hold) or file a new finding`
}
