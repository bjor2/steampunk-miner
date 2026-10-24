import { describe, expect, it } from 'vitest'
import { STAR_MAP_STRIP_SCALE } from '../../constants/starMapCarousel'
import { createScriptedSession } from '../authority/scriptedSession'
import {
  orbitPositionOf,
  STAR_MAP_CAROUSEL_MOTION,
  STAR_MAP_SYSTEM,
} from '../art/starMapCarouselArt'
import {
  panTargetPxOf,
  shownPlaceOf,
  starMapCarouselOf,
  steppedPlaceOf,
  swipeStepOf,
} from './starMapCarousel'
import { starMapViewOf } from './starMapView'

// Ticket 796 (Bjor, 24 Oct: "swipe / next-previous buttons to switch between them ... we kind of
// move on the solar map"): one planet at a time, stopping at the ends, opening on the planet the
// session is on, the system strip panned toward the shown planet's orbit and a swipe judged by
// ticket 795's motion notes.

const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const

/** The star map of a session on `planet` with an empty wallet. */
function mapOn(planet: number) {
  const session = createScriptedSession()
  if (planet !== 1) session.submit(0, setPlanet(planet))
  return starMapViewOf(session.state(), 'p1')
}

const { swipeThresholdPx, swipeMaxOffAxisPx, swipeMaxMs } = STAR_MAP_CAROUSEL_MOTION

describe('star map carousel (ticket 796)', () => {
  it('opens on the planet the session is on', () => {
    expect(starMapCarouselOf(mapOn(1), null).planet.place).toBe(1)
    const onThree = starMapCarouselOf(mapOn(3), null)
    expect(onThree.planet).toMatchObject({ place: 3, isHere: true })
  })

  it('steps to the next and the previous planet, and stops at the ends', () => {
    const map = mapOn(1)
    expect(steppedPlaceOf(map, null, 1)).toBe(2)
    expect(steppedPlaceOf(map, 3, -1)).toBe(2)
    expect(steppedPlaceOf(map, null, -1)).toBe(1)
    expect(steppedPlaceOf(map, 5, 1)).toBe(5)
  })

  it('says whether a step back or on is left, so the buttons stop at the ends', () => {
    const map = mapOn(1)
    expect(starMapCarouselOf(map, 1)).toMatchObject({ canStepBack: false, canStepOn: true })
    expect(starMapCarouselOf(map, 3)).toMatchObject({ canStepBack: true, canStepOn: true })
    expect(starMapCarouselOf(map, 5)).toMatchObject({ canStepBack: true, canStepOn: false })
  })

  it("holds a pick outside the map's places to its ends", () => {
    const map = mapOn(1)
    expect(shownPlaceOf(map, 0)).toBe(1)
    expect(shownPlaceOf(map, 9)).toBe(5)
  })

  it('shows an unaffordable planet dimmed with its numbers, never skipping it', () => {
    const map = mapOn(1)
    const far = starMapCarouselOf(map, 5).planet
    expect(far).toMatchObject({ place: 5, isDimmed: true })
    expect(far.fuel).not.toBeNull()
    expect(steppedPlaceOf(map, 4, 1)).toBe(5)
  })

  it("pans the strip toward the shown planet's orbit on the drawn backdrop", () => {
    const map = mapOn(1)
    for (const place of [1, 2, 3, 4, 5]) {
      const { strip } = starMapCarouselOf(map, place)
      expect(strip.panTargetPx).toBe(orbitPositionOf(place)[0] * STAR_MAP_STRIP_SCALE)
    }
    const targets = [1, 2, 3, 4, 5].map((place) => starMapCarouselOf(map, place).strip)
    expect(targets.map((strip) => strip.panTargetPx)).toEqual(
      [...targets.map((strip) => strip.panTargetPx)].sort((a, b) => a - b),
    )
  })

  it('pans to the strip end for a place past its orbits (system 1 runs past five, #781)', () => {
    expect(panTargetPxOf(6)).toBe(STAR_MAP_SYSTEM.sizePx[0] * STAR_MAP_STRIP_SCALE)
    const pastFive = mapOn(5)
    expect(pastFive.planets.map((planet) => planet.place)).toContain(6)
    expect(starMapCarouselOf(pastFive, 6).strip.dots.map((dot) => dot.place)).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  it('marks the here planet and the shown one among the dots on their sockets', () => {
    const { strip } = starMapCarouselOf(mapOn(2), 4)
    expect(strip.dots.filter((dot) => dot.isHere).map((dot) => dot.place)).toEqual([2])
    expect(strip.dots.filter((dot) => dot.isSelected).map((dot) => dot.place)).toEqual([4])
    const [x, y] = orbitPositionOf(4)
    expect(strip.dots[3].centrePx).toEqual([x * STAR_MAP_STRIP_SCALE, y * STAR_MAP_STRIP_SCALE])
  })

  it("names the first system's previews and leaves a later planet to its tinted glyph", () => {
    expect(starMapCarouselOf(mapOn(1), 3).planet.previewAssetId).toBe('ui-star-map-planet-3')
    expect(starMapCarouselOf(mapOn(5), 6).planet.previewAssetId).toBeNull()
  })
})

describe('star map carousel swipe (ticket 796, the motion notes of ticket 795)', () => {
  it('steps on for a left drag and back for a right one past the threshold', () => {
    expect(swipeStepOf({ dxPx: -swipeThresholdPx, dyPx: 0, ms: 200 })).toBe(1)
    expect(swipeStepOf({ dxPx: swipeThresholdPx + 10, dyPx: 4, ms: 200 })).toBe(-1)
  })

  it("leaves a short, slanted or slow drag to the chart's scroll", () => {
    expect(swipeStepOf({ dxPx: -(swipeThresholdPx - 1), dyPx: 0, ms: 100 })).toBeNull()
    expect(swipeStepOf({ dxPx: -120, dyPx: swipeMaxOffAxisPx + 1, ms: 100 })).toBeNull()
    expect(swipeStepOf({ dxPx: -120, dyPx: 0, ms: swipeMaxMs + 1 })).toBeNull()
  })
})
