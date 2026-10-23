import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { starMapViewOf } from '../../systems/views/starMapView'
import { StarMapChartView } from './StarMapChart'
import { starMapGlyphIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'

// Ticket 757 (#650 Map UX): the chart draws every planet of the system with its numbers, the one
// the session is on marked and the ones the player cannot afford dimmed, never dropped.

const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const

/** The chart of a session on `planet` with an empty wallet and an empty tank. */
function drawChartOn(planet: number): string {
  const session = createScriptedSession()
  if (planet !== 1) session.submit(0, setPlanet(planet))
  return renderToString(
    createElement(StarMapChartView, { map: starMapViewOf(session.state(), 'p1') }),
  )
}

/** The opening tag of the element carrying `testId`. */
function tagOf(html: string, testId: string): string {
  const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)
  if (tag === null) throw new Error(`no element ${testId}`)
  return tag[0]
}

beforeEach(() => forgetUiTexts())

describe('star map chart (ticket 757)', () => {
  it('draws the tank and a row for every planet of the system', () => {
    const html = drawChartOn(1)
    expect(html).toContain(`data-testid="${STAR_MAP_UI_IDS.starMapTank}"`)
    for (const place of [1, 2, 3, 4, 5]) expect(html).toContain(starMapPlanetIdOf(place))
  })

  it('marks the planet the session is on and dims the ones the player cannot afford', () => {
    const html = drawChartOn(1)
    expect(tagOf(html, starMapPlanetIdOf(1))).toContain('data-here')
    expect(tagOf(html, starMapPlanetIdOf(2))).not.toContain('data-dimmed')
    expect(tagOf(html, starMapPlanetIdOf(5))).toContain('data-dimmed')
  })

  it("draws the system view: the sun, the tank's bar and each planet's glyph in its own colour (ticket 758)", () => {
    const html = drawChartOn(1)
    const map = starMapViewOf(createScriptedSession().state(), 'p1')
    expect(html).toContain(`data-testid="${STAR_MAP_UI_IDS.starMapSun}"`)
    expect(tagOf(html, STAR_MAP_UI_IDS.starMapTankBar)).toContain('aria-valuenow="0"')
    for (const planet of map.planets) {
      expect(tagOf(html, starMapGlyphIdOf(planet.place))).toContain(
        `--planet-colour:${planet.colour}`,
      )
    }
  })

  it('draws every word on a shared element within the text budget', () => {
    const html = drawChartOn(8)
    expect(unregisteredTextsOf(html)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })
})
