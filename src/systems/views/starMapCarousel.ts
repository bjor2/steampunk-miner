/**
 * The star map carousel (ticket 796, spec #647; Bjor's request of 24 Oct 2026: the planets
 * visualised, swiped or stepped through, moving on the solar map between them): one planet of the
 * map at a time as the hero, and the system strip (ticket 795's backdrop) with every planet on its
 * orbit, the here ring on the session's and the selected marker on the shown one, panned so the
 * shown planet's socket is centred.
 *
 * The player's choice is UI state (`starMapPlace`, null for the planet the session is on), so
 * opening the map shows the session's planet; a step stops at the map's ends (the GD's default on
 * #796) and a swipe is judged by #795's motion notes. A planet the player cannot afford is shown
 * dimmed with its numbers, never skipped (the #650 rule). Reads the star map's view only: no
 * command, no log line.
 */
import { STAR_MAP_STRIP_SCALE, STAR_MAP_STRIP_WINDOW_PX } from '../../constants/starMapCarousel'
import {
  hasOrbitAt,
  orbitPositionOf,
  STAR_MAP_CAROUSEL_MOTION,
  STAR_MAP_SYSTEM,
  type StarMapCarouselMotion,
} from '../art/starMapCarouselArt'
import type { Pair } from '../art/partsSidecar'
import type { StarMapPlanet, StarMapView } from './starMapView'

/** A step through the map: -1 the previous planet, 1 the next. */
export type CarouselStep = -1 | 1

export interface StarMapCarousel {
  /** The planet the hero shows. */
  planet: StarMapPlanet
  /** A previous planet exists: the carousel stops at the first. */
  canStepBack: boolean
  /** A next planet exists: the carousel stops at the last. */
  canStepOn: boolean
  strip: StarMapStrip
}

/** The system strip as drawn: the scaled backdrop, the pan and the planets on their orbits. */
export interface StarMapStrip {
  /** The backdrop's drawn size, CSS px. */
  sizePx: Pair
  /** The strip's window height: a band round the orbits' middle line. */
  windowHeightPx: number
  /** How far the backdrop's top sits above the window's, so the middle line runs through it. */
  liftPx: number
  /** The x on the drawn backdrop the window centres on; the window holds it at the strip's ends. */
  panTargetPx: number
  /** One per planet with an orbit on the strip, innermost first. */
  dots: StarMapDot[]
}

export interface StarMapDot {
  place: number
  name: string
  /** The dot's centre on the drawn backdrop, CSS px. */
  centrePx: Pair
  isHere: boolean
  isSelected: boolean
  isDimmed: boolean
  previewAssetId: string | null
  colour: string
}

/** A pointer's drag from press to release, for the swipe. */
export interface PointerDrag {
  dxPx: number
  dyPx: number
  ms: number
}

/** The carousel as it draws now: `chosenPlace` is the player's pick, null for the here planet. */
export function starMapCarouselOf(map: StarMapView, chosenPlace: number | null): StarMapCarousel {
  const place = shownPlaceOf(map, chosenPlace)
  return {
    planet: planetAtPlace(map, place),
    canStepBack: place > firstPlaceOf(map),
    canStepOn: place < lastPlaceOf(map),
    strip: starMapStripOf(map, place),
  }
}

/** The place the carousel shows: the pick held to the map's places, else the session's planet. */
export function shownPlaceOf(map: StarMapView, chosenPlace: number | null): number {
  return placeShownAmong(placesOf(map), herePlaceOf(map), chosenPlace)
}

/** The same rule over bare places, for the controls, which read no map. */
export function placeShownAmong(
  places: readonly number[],
  herePlace: number,
  chosenPlace: number | null,
): number {
  if (chosenPlace === null) return herePlace
  return Math.min(places[places.length - 1], Math.max(places[0], chosenPlace))
}

/** One step from the shown planet, held at the map's first and last. */
export function steppedPlaceOf(
  map: StarMapView,
  chosenPlace: number | null,
  step: CarouselStep,
): number {
  return shownPlaceOf(map, shownPlaceOf(map, chosenPlace) + step)
}

/**
 * The step a drag makes (#795's motion notes): far enough along x, close enough to its axis and
 * quick enough; left steps on, right back. Anything else is the chart's scroll: null.
 */
export function swipeStepOf(
  drag: PointerDrag,
  motion: StarMapCarouselMotion = STAR_MAP_CAROUSEL_MOTION,
): CarouselStep | null {
  if (!isSwipe(drag, motion)) return null
  return drag.dxPx < 0 ? 1 : -1
}

function isSwipe(drag: PointerDrag, motion: StarMapCarouselMotion): boolean {
  const isFarEnough = Math.abs(drag.dxPx) >= motion.swipeThresholdPx
  const isOnAxis = Math.abs(drag.dyPx) <= motion.swipeMaxOffAxisPx
  return isFarEnough && isOnAxis && drag.ms <= motion.swipeMaxMs
}

/** The x the strip's window centres on for a place: its socket, or the strip's end past them. */
export function panTargetPxOf(place: number): number {
  const [x] = hasOrbitAt(place) ? orbitPositionOf(place) : STAR_MAP_SYSTEM.sizePx
  return scaled(x)
}

function starMapStripOf(map: StarMapView, place: number): StarMapStrip {
  const [width, height] = STAR_MAP_SYSTEM.sizePx
  return {
    sizePx: [scaled(width), scaled(height)],
    windowHeightPx: STAR_MAP_STRIP_WINDOW_PX,
    liftPx: scaled(STAR_MAP_SYSTEM.sunCentrePx[1]) - STAR_MAP_STRIP_WINDOW_PX / 2,
    panTargetPx: panTargetPxOf(place),
    dots: map.planets
      .filter((planet) => hasOrbitAt(planet.place))
      .map((planet) => dotOf(planet, place)),
  }
}

function dotOf(planet: StarMapPlanet, selectedPlace: number): StarMapDot {
  const [x, y] = orbitPositionOf(planet.place)
  return {
    place: planet.place,
    name: planet.name,
    centrePx: [scaled(x), scaled(y)],
    isHere: planet.isHere,
    isSelected: planet.place === selectedPlace,
    isDimmed: planet.isDimmed,
    previewAssetId: planet.previewAssetId,
    colour: planet.colour,
  }
}

function scaled(px: number): number {
  return px * STAR_MAP_STRIP_SCALE
}

function placesOf(map: StarMapView): number[] {
  return map.planets.map((planet) => planet.place)
}

function herePlaceOf(map: StarMapView): number {
  return map.planets.find((planet) => planet.isHere)?.place ?? firstPlaceOf(map)
}

function firstPlaceOf(map: StarMapView): number {
  return map.planets[0].place
}

function lastPlaceOf(map: StarMapView): number {
  return map.planets[map.planets.length - 1].place
}

function planetAtPlace(map: StarMapView, place: number): StarMapPlanet {
  const planet = map.planets.find((shown) => shown.place === place)
  if (planet === undefined) throw new RangeError(`the star map has no planet at place ${place}`)
  return planet
}
