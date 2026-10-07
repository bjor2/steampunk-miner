/**
 * When a debug run takes a planet-change screenshot (#123, logging strategy section 1: "every
 * planet change"): a batch of authority events in which the run arrived on a planet by travel
 * (`PlanetEntered`) or was moved to one by the debug API or a scenario (`PlanetChanged`). One
 * batch is one change, so it is due one screenshot whatever else it holds.
 */
import type { DomainEvent } from '../authority/domainEvent'

export function hasPlanetChanged(events: readonly DomainEvent[]): boolean {
  return events.some(isPlanetChange)
}

function isPlanetChange(event: DomainEvent): boolean {
  return event.type === 'PlanetEntered' || event.type === 'PlanetChanged'
}
