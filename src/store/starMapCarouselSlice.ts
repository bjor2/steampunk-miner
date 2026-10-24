/**
 * The game store's star map carousel slice (ticket 796, beside `starMapSlice.ts`): the planet the
 * player picked on the open map, null for the one the session is on, which is what opening the
 * map shows. The Previous and Next buttons, a swipe, ←/→ or the pad's d-pad at a bay step it,
 * stopping at the map's ends; a tap or click on a planet of the system strip picks that one. A
 * step leaves no Jump armed, so a confirm never lands on a planet the player stepped away from.
 * UI state only: never a command, a log line or part of the digest.
 */
import { readAuthorityState } from './authorityLink'
import { steppedPlaceOf, type CarouselStep } from '../systems/views/starMapCarousel'
import { starMapViewOf } from '../systems/views/starMapView'

export interface StarMapCarouselValues {
  /** The planet's place the carousel shows; null for the one the session is on. */
  starMapPlace: number | null
}

export interface StarMapCarouselActions {
  /** Previous, Next, a swipe or ←/→: one planet back or on, held at the map's ends. */
  stepStarMapPlanet(step: CarouselStep): void
  /** A planet tapped or clicked on the system strip. */
  showStarMapPlanet(place: number): void
  /** Opening the map: back to the planet the session is on. */
  showHerePlanetOnStarMap(): void
}

interface SliceHost extends StarMapCarouselValues {
  playerId: string
}

type SetSlice = (partial: StarMapCarouselValues & { armedJumpId: null }) => void

export const STARTING_STAR_MAP_CAROUSEL: StarMapCarouselValues = { starMapPlace: null }

export function starMapCarouselActionsOf(
  set: SetSlice,
  get: () => SliceHost,
): StarMapCarouselActions {
  return {
    stepStarMapPlanet: (step) => set(showing(steppedPlaceOn(get(), step))),
    showStarMapPlanet: (place) => set(showing(place)),
    showHerePlanetOnStarMap: () => set(showing(null)),
  }
}

function steppedPlaceOn(host: SliceHost, step: CarouselStep): number {
  const map = starMapViewOf(readAuthorityState(), host.playerId)
  return steppedPlaceOf(map, host.starMapPlace, step)
}

function showing(place: number | null) {
  return { starMapPlace: place, armedJumpId: null }
}
