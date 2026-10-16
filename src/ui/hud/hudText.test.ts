import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { titleOnlyTextsOf } from '../../systems/views/titleOnlyText'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { everyReadoutOf } from './hudFixtures'
import { HudView } from './HudView'
import { SlowDeviceChipView } from './SlowDeviceChip'

// Spec #422, pass #428: the HUD is handed a model with every readout and call-out up at once
// (`everyReadoutOf`) and judged as the budget test does.

function drawEveryReadout(): string {
  const model = everyReadoutOf(readHudModel())
  return renderToString(createElement(HudView, { model, isFlashing: true }))
}

beforeEach(() => {
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => forgetUiTexts())

describe('HUD text budget (spec #422, pass #428)', () => {
  it('draws every readout and call-out on a shared element, with no stray text', () => {
    const markup = drawEveryReadout()
    expect(markup).toContain('data-testid="hud-statuses"')
    expect(unregisteredTextsOf(markup)).toEqual([])
  })

  it('says every status in a drawn line, never in a hover title alone (ticket 476)', () => {
    const markup = drawEveryReadout()
    expect(markup).toContain('data-testid="hud-status-hull_critical"')
    expect(titleOnlyTextsOf(markup)).toEqual([])
  })

  it('keeps every HUD element within the text budget and its tag rules', () => {
    drawEveryReadout()
    const texts = registeredUiTexts().filter((text) => text.id.startsWith('hud.'))
    expect(texts.length).toBeGreaterThan(20)
    expect(texts.flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('shows the charges and the lining bill on the element, never in a tooltip', () => {
    drawEveryReadout()
    const lines = registeredUiTexts().flatMap((text) => text.lines)
    const held = lines.filter((line) => line.holds !== undefined)
    expect(held.map((line) => line.holds).sort()).toEqual(['charges', 'price'])
    expect(held.every((line) => line.tag === 'visible')).toBe(true)
  })

  it('opens no tooltip on the HUD, which lets every click through to the game', () => {
    drawEveryReadout()
    const hudTexts = registeredUiTexts().filter((text) => text.id.startsWith('hud.'))
    expect(hudTexts.flatMap((text) => text.tooltipLines)).toEqual([])
  })

  it('says the slow-device chip on a shared element within the budget (ticket 480)', () => {
    const markup = renderToString(createElement(SlowDeviceChipView))
    expect(markup).toContain('data-testid="hud-slow-device"')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().map((text) => text.id)).toEqual(['hud.slow-device'])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })
})
