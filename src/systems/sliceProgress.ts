/**
 * What the screen shows about the run's progress through the slice (decisions #2, #8, #10), read
 * from the authority's events and state. Presentation only: the authority has already changed
 * the state when any of this shows.
 */
import { SLICE_LAST_PLANET } from '../constants/balance'
import type { DomainEvent } from './authority/domainEvent'

export interface TravelTransition {
  fromPlanet: number
  toPlanet: number
}

/** The transition to play for these events: the last `travel_started` among them, if any. */
export function travelTransitionOf(events: readonly DomainEvent[]): TravelTransition | null {
  const started = events.filter((event) => event.type === 'TravelStarted').at(-1)
  if (started?.type !== 'TravelStarted') return null
  return { fromPlanet: started.fromPlanet, toPlanet: started.toPlanet }
}

/** The end-of-slice card follows the completed core of the slice's last planet (#2 item 5). */
export function isSliceEndReached(planetIndex: number, isCoreCompleted: boolean): boolean {
  return isCoreCompleted && planetIndex >= SLICE_LAST_PLANET
}
