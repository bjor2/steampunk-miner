import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { starMapCarouselImagesOf } from '../../systems/art/starMapCarouselImages'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { starMapCarouselOf } from '../../systems/views/starMapCarousel'
import { starMapViewOf } from '../../systems/views/starMapView'
import {
  STAR_MAP_BUY_DRIVE_ID,
  STAR_MAP_BUY_TANK_ID,
  starMapBuyFuelIdOf,
  starMapJumpIdOf,
} from '../../systems/views/starMapControlIds'
import { starMapControlsOf } from '../../systems/views/starMapControls'
import { StarMapChartView } from './StarMapChart'
import { starMapDotIdOf, starMapGlyphIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'

// Ticket 757 (#650 Map UX): the chart shows the planets of the system with their numbers, the one
// the session is on marked and the ones the player cannot afford dimmed, never dropped. Ticket
// 793: a planet carries its Jump, and at the Sell bay its Buy fuel, the tank's next level and the
// jump drive. Ticket 796: one planet at a time as the carousel's hero, with every planet on the
// system strip, the here ring and the selected marker, panned toward the shown one.

const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const
const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const
const IMAGES = starMapCarouselImagesOf(SHIPPED_ART)

interface Drawing {
  money?: string
  isDocked?: boolean
  /** The carousel's pick; null shows the planet the session is on. */
  place?: number | null
  isMotionReduced?: boolean
}

/** The chart of a session on `planet` with an empty tank and `money`, docked at the Sell bay or not. */
function drawChartOn(
  planet: number,
  { money = '0', isDocked = false, place = null, isMotionReduced = false }: Drawing = {},
): string {
  const session = createScriptedSession()
  if (planet !== 1) session.submit(0, setPlanet(planet))
  session.submit(1, setMoney(money))
  if (isDocked) session.submit(5, dockAtSell)
  const state = session.state()
  const map = starMapViewOf(state, 'p1')
  return renderToString(
    createElement(StarMapChartView, {
      map,
      carousel: starMapCarouselOf(map, place),
      controls: starMapControlsOf(state, 'p1', { armedJumpId: null, starMapPlace: place }),
      focusedId: null,
      isMotionReduced,
      images: IMAGES,
    }),
  )
}

/** The opening tag of the element carrying `testId`. */
function tagOf(html: string, testId: string): string {
  const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)
  if (tag === null) throw new Error(`no element ${testId}`)
  return tag[0]
}

const hasTestId = (html: string, testId: string) => html.includes(`data-testid="${testId}"`)

beforeEach(() => forgetUiTexts())

describe('star map chart (ticket 757, the carousel of ticket 796)', () => {
  it('draws the tank, the hero and the card of the planet the session is on when it opens', () => {
    const html = drawChartOn(2)
    for (const id of [STAR_MAP_UI_IDS.starMapTank, STAR_MAP_UI_IDS.starMapHero]) {
      expect(hasTestId(html, id)).toBe(true)
    }
    expect(tagOf(html, starMapPlanetIdOf(2))).toContain('data-here')
    for (const place of [1, 3, 4, 5]) expect(hasTestId(html, starMapPlanetIdOf(place))).toBe(false)
  })

  it('draws every planet on the system strip, the here ring on its own and the marker on the shown one', () => {
    const html = drawChartOn(2, { place: 4 })
    for (const place of [1, 2, 3, 4, 5]) expect(hasTestId(html, starMapDotIdOf(place))).toBe(true)
    expect(tagOf(html, starMapDotIdOf(2))).toContain('data-here')
    expect(tagOf(html, starMapDotIdOf(4))).toContain('data-selected')
    expect(html.match(/data-testid="star-map-selected-marker"/g)).toHaveLength(1)
    expect(html.match(/data-testid="star-map-here-ring"/g)).toHaveLength(1)
  })

  it("pans the strip's backdrop toward the shown planet's orbit", () => {
    const near = tagOf(drawChartOn(1, { place: 2 }), STAR_MAP_UI_IDS.starMapSystemTrack)
    const far = tagOf(drawChartOn(1, { place: 4 }), STAR_MAP_UI_IDS.starMapSystemTrack)
    const targetOf = (tag: string) => Number(/data-pan-target-px="([\d.]+)"/.exec(tag)?.[1])
    expect(targetOf(far)).toBeGreaterThan(targetOf(near))
    expect(near).toContain(`--pan-target:${targetOf(near)}px`)
  })

  it('draws the shown planet as its shipped preview, and a planet with none as its tinted glyph', () => {
    const shown = tagOf(drawChartOn(1, { place: 3 }), starMapGlyphIdOf(3))
    expect(shown).toContain('ui-star-map-planet-3@2x.png 2x')
    const pastFive = drawChartOn(5, { place: 6 })
    expect(tagOf(pastFive, starMapGlyphIdOf(6))).toContain('--planet-colour')
  })

  it('stops the Previous and Next buttons at the ends of the system', () => {
    const first = drawChartOn(1)
    expect(tagOf(first, STAR_MAP_UI_IDS.starMapPrevious)).toContain('disabled')
    expect(tagOf(first, STAR_MAP_UI_IDS.starMapNext)).not.toContain('disabled')
    const last = drawChartOn(1, { place: 5 })
    expect(tagOf(last, STAR_MAP_UI_IDS.starMapNext)).toContain('disabled')
  })

  it('cuts the pan and the crossfade under reduced motion', () => {
    const html = drawChartOn(1, { place: 3, isMotionReduced: true })
    expect(tagOf(html, STAR_MAP_UI_IDS.starMapHero)).toContain('data-motion="cut"')
    expect(html).toMatch(/data-motion="cut"[^>]*>\s*<div[^>]*data-testid="star-map-system-track"/)
  })

  it('draws every word on a shared element within the text budget', () => {
    const html = drawChartOn(8)
    expect(unregisteredTextsOf(html)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('keeps the controls at the Sell bay on shared elements within the text budget (ticket 793)', () => {
    for (const place of [1, 3, 5]) {
      const html = drawChartOn(5, { money: '1e30', isDocked: true, place })
      expect(unregisteredTextsOf(html)).toEqual([])
    }
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it("draws the shown planet's Jump, and none while it is the one the session is on (ticket 793)", () => {
    expect(hasTestId(drawChartOn(1), starMapJumpIdOf(1))).toBe(false)
    for (const place of [2, 3, 4, 5]) {
      expect(hasTestId(drawChartOn(1, { place }), starMapJumpIdOf(place))).toBe(true)
    }
  })

  it('draws an unaffordable planet dimmed with its Jump refused, never hidden (ticket 793)', () => {
    const html = drawChartOn(1, { isDocked: true, place: 5 })
    expect(tagOf(html, starMapPlanetIdOf(5))).toContain('data-dimmed')
    expect(tagOf(html, starMapDotIdOf(5))).toContain('data-dimmed')
    expect(tagOf(html, starMapJumpIdOf(5))).toContain('data-reason="fuel_short"')
    expect(tagOf(html, starMapBuyFuelIdOf(5))).toContain('data-reason="money_short"')
  })

  it('draws Buy fuel, the bigger tank and the jump drive only at the Sell bay (ticket 793)', () => {
    const docked = drawChartOn(1, { money: '1e30', isDocked: true, place: 3 })
    for (const id of [starMapBuyFuelIdOf(3), STAR_MAP_BUY_TANK_ID, STAR_MAP_BUY_DRIVE_ID]) {
      expect(hasTestId(docked, id)).toBe(true)
    }
    const away = drawChartOn(1, { money: '1e30', place: 3 })
    for (const id of [starMapBuyFuelIdOf(3), STAR_MAP_BUY_TANK_ID, STAR_MAP_BUY_DRIVE_ID]) {
      expect(hasTestId(away, id)).toBe(false)
    }
  })
})
