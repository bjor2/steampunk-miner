/**
 * The game store's planet-card slice (ticket 343, TD lock on #293 Q2): the card opens where the
 * client logs `planet_entered` (the starting planet of a run, and travel's arrival) and where the
 * debug API or a scenario moves the session to a planet, reading the live classes' lines then. It
 * shows after the travel card, over the bay screen while docked on arrival, and closes when the
 * local vehicle undocks, on its timeout or on Dismiss. Client-side only: no command, no saved
 * state, not in the digest.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import { planetCardOf, type PlanetCard } from '../systems/registries/planetCardLines'
import { hasPlanetChanged } from '../systems/snapshots/planetChange'
import { readAuthorityState } from './authorityLink'

export interface PlanetCardValues {
  /** The planet card on screen, or null. */
  planetCard: PlanetCard | null
}

export interface PlanetCardActions {
  /** Opens the card of the session's planet; none where no live class has a line for it. */
  openPlanetCard(): void
  /** Opens the card when the events changed the planet, closes it when the player undocked. */
  followPlanetCard(events: readonly DomainEvent[]): void
  dismissPlanetCard(): void
}

type SliceHost = PlanetCardValues & PlanetCardActions & { playerId: string }

type SetSlice = (partial: Partial<PlanetCardValues>) => void

export const STARTING_PLANET_CARD: PlanetCardValues = { planetCard: null }

export function planetCardActionsOf(set: SetSlice, get: () => SliceHost): PlanetCardActions {
  return {
    openPlanetCard: () => set({ planetCard: planetCardOf(readAuthorityState()) }),
    followPlanetCard: (events) => set({ planetCard: planetCardAfter(events, get()) }),
    dismissPlanetCard: () => set({ planetCard: null }),
  }
}

/** The card on screen now: it waits behind the travel card. */
export function shownPlanetCardOf(
  state: PlanetCardValues & { travelTransition: unknown },
): PlanetCard | null {
  return state.travelTransition === null ? state.planetCard : null
}

/** A new planet's card, none once the player undocked, else the card on screen. */
function planetCardAfter(events: readonly DomainEvent[], host: SliceHost): PlanetCard | null {
  if (hasPlanetChanged(events)) return planetCardOf(readAuthorityState())
  return hasUndocked(events, host.playerId) ? null : host.planetCard
}

function hasUndocked(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some((event) => event.type === 'DockLeft' && event.playerId === playerId)
}
