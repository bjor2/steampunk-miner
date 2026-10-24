import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { starMapViewOf } from '../../systems/views/starMapView'
import {
  STAR_MAP_BUY_DRIVE_ID,
  STAR_MAP_BUY_TANK_ID,
  starMapBuyFuelIdOf,
  starMapJumpIdOf,
} from '../../systems/views/starMapControlIds'
import { starMapControlsOf } from '../../systems/views/starMapControls'
import { StarMapChartView } from './StarMapChart'
import { starMapGlyphIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'

// Ticket 757 (#650 Map UX): the chart draws every planet of the system with its numbers, the one
// the session is on marked and the ones the player cannot afford dimmed, never dropped. Ticket
// 793: each other planet carries its Jump, and at the Sell bay its Buy fuel, the tank's next level
// and the jump drive.

const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const
const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const

/** The chart of a session on `planet` with an empty tank, `money` and docked at the Sell bay or not. */
function drawChartOn(planet: number, { money = '0', isDocked = false } = {}): string {
  const session = createScriptedSession()
  if (planet !== 1) session.submit(0, setPlanet(planet))
  session.submit(1, setMoney(money))
  if (isDocked) session.submit(5, dockAtSell)
  const state = session.state()
  return renderToString(
    createElement(StarMapChartView, {
      map: starMapViewOf(state, 'p1'),
      controls: starMapControlsOf(state, 'p1', { armedJumpId: null }),
      focusedId: null,
    }),
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

  it('keeps the controls at the Sell bay on shared elements within the text budget (ticket 793)', () => {
    const html = drawChartOn(5, { money: '1e30', isDocked: true })
    expect(unregisteredTextsOf(html)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('draws a Jump on every planet but the one the session is on (ticket 793)', () => {
    const html = drawChartOn(1)
    expect(html).not.toContain(`data-testid="${starMapJumpIdOf(1)}"`)
    for (const place of [2, 3, 4, 5])
      expect(html).toContain(`data-testid="${starMapJumpIdOf(place)}"`)
  })

  it('draws an unaffordable planet dimmed with its Jump refused, never hidden (ticket 793)', () => {
    const html = drawChartOn(1, { isDocked: true })
    expect(tagOf(html, starMapPlanetIdOf(5))).toContain('data-dimmed')
    expect(tagOf(html, starMapJumpIdOf(5))).toContain('data-reason="fuel_short"')
    expect(tagOf(html, starMapBuyFuelIdOf(5))).toContain('data-reason="money_short"')
  })

  it('draws Buy fuel, the bigger tank and the jump drive only at the Sell bay (ticket 793)', () => {
    const docked = drawChartOn(1, { money: '1e30', isDocked: true })
    for (const id of [starMapBuyFuelIdOf(3), STAR_MAP_BUY_TANK_ID, STAR_MAP_BUY_DRIVE_ID]) {
      expect(docked).toContain(`data-testid="${id}"`)
    }
    const away = drawChartOn(1, { money: '1e30' })
    for (const id of [starMapBuyFuelIdOf(3), STAR_MAP_BUY_TANK_ID, STAR_MAP_BUY_DRIVE_ID]) {
      expect(away).not.toContain(`data-testid="${id}"`)
    }
  })
})
