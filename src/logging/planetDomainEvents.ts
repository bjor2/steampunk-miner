/**
 * A bot run's domain events with the planet each batch was logged on (ticket 420, the GD ruling
 * on #396 Q2): a drill span folds its units into one `drill_cut` line, so the report rows that
 * read every unit (its tile, depth and drill ticks) read the domain events instead, on the planet
 * their run-log lines would have named. Only the index where the planet changes is kept, so the
 * run's own event list is shared, not copied.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'

/** From event index `from` on, the batches were logged on `planet`. */
export interface PlanetStart {
  from: number
  planet: number
}

export interface PlanetDomainEvents {
  events: readonly DomainEvent[]
  planetStarts: readonly PlanetStart[]
}

export const NO_DOMAIN_EVENTS: PlanetDomainEvents = { events: [], planetStarts: [] }

/** Keeps the planet starts of a run as its batches arrive, the planet stamped after each. */
export interface PlanetStartTracker {
  noteBatch(planet: number, events: readonly DomainEvent[]): void
  planetStarts(): readonly PlanetStart[]
}

export function trackPlanetStarts(): PlanetStartTracker {
  const starts: PlanetStart[] = []
  let seen = 0
  return {
    noteBatch: (planet, events) => {
      if (starts.at(-1)?.planet !== planet) starts.push({ from: seen, planet })
      seen += events.length
    },
    planetStarts: () => starts,
  }
}

/** The events logged on `planet`, in order. */
export function domainEventsOnPlanet(
  { events, planetStarts }: PlanetDomainEvents,
  planet: number,
): DomainEvent[] {
  return planetStarts.flatMap((start, index) =>
    start.planet === planet ? events.slice(start.from, planetStarts[index + 1]?.from) : [],
  )
}
