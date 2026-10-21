/**
 * How often the travel fee clamp binds (ticket 648, VS condition of the GD lock, 21 Oct): a hop is
 * clamped when its logged `travel_started` cost is below the row fee of the planet it left. The
 * on-curve bot may see it bind on at most 1 of the 4 P1→P5 hops; more says the base fee formula
 * needs fixing, never the clamp. Derived from the log, never written into it (#11 section 3).
 */
import { travelFee } from '../systems/economy/planetCharges'
import { cmp, fromCanonical } from '../systems/money'
import type { RunEvent } from './runEvent'

/** The hops judged against the condition: leaving planets 1 to 4. */
const OPENING_HOP_LAST_FROM = 4
const OPENING_HOPS_CLAMPED_MOST = 1

export interface TravelClampCount {
  hops: number
  clamped: number
  openingHops: number
  openingClamped: number
}

interface SeededEvents {
  worldSeed: number
  events: readonly RunEvent[]
}

export function travelClampCountOf(events: readonly RunEvent[]): TravelClampCount {
  const hops = events.filter(isTravelStarted)
  const opening = hops.filter((hop) => hop.data.fromPlanet <= OPENING_HOP_LAST_FROM)
  return {
    hops: hops.length,
    clamped: hops.filter(isHopClamped).length,
    openingHops: opening.length,
    openingClamped: opening.filter(isHopClamped).length,
  }
}

/** One line per seed, flagged when the clamp binds on more than 1 of the P1→P5 hops. */
export function travelClampLines(runs: readonly SeededEvents[]): string[] {
  return runs.map((run) => travelClampLine(run.worldSeed, travelClampCountOf(run.events)))
}

function travelClampLine(worldSeed: number, count: TravelClampCount): string {
  const flag = count.openingClamped > OPENING_HOPS_CLAMPED_MOST ? ' · fix the base fee formula' : ''
  return (
    `seed ${worldSeed} · clamped on ${count.openingClamped} of ${count.openingHops} P1→P5 hops, ` +
    `${count.clamped} of ${count.hops} hops in all${flag}`
  )
}

function isTravelStarted(event: RunEvent): event is RunEvent<'travel_started'> {
  return event.event === 'travel_started'
}

function isHopClamped(hop: RunEvent<'travel_started'>): boolean {
  return cmp(fromCanonical(hop.data.cost), travelFee(hop.data.fromPlanet)) < 0
}
