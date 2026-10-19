/**
 * The VS bar (b) of ticket 564 held as known red under the combat damage track #565 (the GD's
 * ruling on #551, 18 Oct, relayed by the Producer: if the track slips, C2 lands dark with an expiry
 * and a known-red marker naming it). `drill.noseContact` ships off until #565 flips it, so on the
 * shipped flags the dwell at speed is still the pose-only pin's: none at 84 m/s against six at
 * 5 m/s. The rule is `logging/knownRed.ts`'s (ticket 419), local to the row as
 * `carveGeometryKnownRed.ts` is: a held row still runs and prints its reading with the finding
 * number, only while #565 is open and the row is actually red; a row that turned green (delete the
 * marker) or a closed #565 (the marker expired) fails. Spec support; it reads, never writes.
 */
import type { KnownRedMarker } from '../../../constants/knownRed'

/** The finding ticket's metrics file (`docs/metrics/tickets/<n>.json`) as text, or null if none. */
export type FindingTicketFileReader = (finding: number) => string | null

/** Local to the row: the repo's one exported marker is ticket 419's. */
const NOSE_CONTACT_MARKER: KnownRedMarker = {
  finding: 565,
  reason:
    'drill.noseContact ships off until the combat damage track (#565) gives the dwell its own damage, so on the shipped flags a fast rig still passes an enemy undamaged',
}

/** The finding the row is held under. */
export const NOSE_CONTACT_FINDING = NOSE_CONTACT_MARKER.finding

/** What the row says: its failures, and its misses held as known red, printed. */
export interface NoseContactVerdict {
  readonly failures: string[]
  readonly knownRed: string[]
}

/** The verdict on the row's misses (`[]` when every speed's dwell matched the 5 m/s one). */
export function noseContactVerdictOf(
  misses: readonly string[],
  readFindingTicketFile: FindingTicketFileReader,
): NoseContactVerdict {
  const closedOn = closedOnIn(readFindingTicketFile(NOSE_CONTACT_MARKER.finding))
  if (closedOn !== null) return { failures: [expiredProblemOf(closedOn), ...misses], knownRed: [] }
  if (misses.length === 0) return { failures: [greenProblem()], knownRed: [] }
  return {
    failures: [],
    knownRed: misses.map((miss) => `known-red (#${NOSE_CONTACT_MARKER.finding}): ${miss}`),
  }
}

/** As `logging/knownRed.ts` reads the loop's metrics file; `systems/` imports nothing above it. */
function closedOnIn(ticketFile: string | null): string | null {
  if (ticketFile === null) return null
  const closed = (JSON.parse(ticketFile) as { closed?: string | null }).closed
  return closed ?? null
}

function expiredProblemOf(closedOn: string): string {
  return `known-red marker for #${NOSE_CONTACT_MARKER.finding} expired: the finding closed on ${closedOn}; turn drill.noseContact on and delete the marker`
}

function greenProblem(): string {
  return `the dwell at speed is green but still marked known-red for #${NOSE_CONTACT_MARKER.finding}: delete the marker`
}
