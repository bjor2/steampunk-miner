/**
 * What the screen shows about the run's progress through the slice (decisions #2, #8, #10), read
 * from the authority's events and state. Presentation only: the authority has already changed
 * the state when any of this shows.
 */
import { SLICE_LAST_PLANET } from '../constants/balance'
import { JUMP_TRANSITION_SECONDS, TRAVEL_TRANSITION_SECONDS } from '../constants/scene'
import type { DomainEvent, DomainEventBodies } from './authority/domainEvent'

export interface TravelTransition {
  fromPlanet: number
  toPlanet: number
  /** How long it plays before control returns: a star-map jump's 2 s, `Travel`'s 10 s. */
  seconds: number
}

/** The transition to play for these events: the last `travel_started` among them, if any. */
export function travelTransitionOf(events: readonly DomainEvent[]): TravelTransition | null {
  const started = events.filter((event) => event.type === 'TravelStarted').at(-1)
  if (started?.type !== 'TravelStarted') return null
  const { fromPlanet, toPlanet } = started
  return { fromPlanet, toPlanet, seconds: transitionSecondsOf(started) }
}

/** A jump names the fuel it burnt (ticket 755); a `Travel` does not. */
function transitionSecondsOf(started: DomainEventBodies['TravelStarted']): number {
  return started.fuelSpent === undefined ? TRAVEL_TRANSITION_SECONDS : JUMP_TRANSITION_SECONDS
}

/** The end-of-slice card follows the completed core of the slice's last planet (#2 item 5). */
export function isSliceEndReached(planetIndex: number, isCoreCompleted: boolean): boolean {
  return isCoreCompleted && planetIndex >= SLICE_LAST_PLANET
}
