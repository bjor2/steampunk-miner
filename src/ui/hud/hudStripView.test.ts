import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { MOST_STATUSES_SHOWN } from '../../systems/views/combatStatuses'
import {
  COMPACT_CHIP_WORDS_MAX,
  COMPACT_LABEL_WORDS_MAX,
  shownLabelWordsOf,
} from '../../systems/views/hudCompact'
import type { LayoutKind } from '../../systems/views/designSystem'
import { gaugeClusterOf } from '../../systems/views/gaugeCluster'
import type { HudModel } from '../../systems/views/hudModel'
import { hudStripOf } from '../../systems/views/hudStrip'
import { amountReading } from '../../systems/views/viewParts'
import { forgetUiTexts, registeredUiTexts, type UiText } from '../../systems/views/uiText'
import { uiTextProblemsOf, wordCountOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { everyReadoutOf } from './hudFixtures'
import { HudStrip } from './HudStrip'
import { HudView } from './HudView'

// Ticket 684 (spec #678, GD lock 21 Oct): the stacked panels are gone. The always-on HUD is one
// strip of the brass gauge cluster's needle-only dials (ticket 716), one number and the status
// icons, at most 6 label words (#500 GD ruling 4); every exact value and word sits in the detail
// behind the gear button.

function drawStrip(model: HudModel, kind: LayoutKind = 'desktop'): string {
  const cluster = gaugeClusterOf(model, kind)
  return renderToString(
    createElement(HudStrip, { strip: hudStripOf(model), cluster, model, isFlashing: false }),
  )
}

function drawHud(model: HudModel, isDetailOpen = false): string {
  return renderToString(createElement(HudView, { model, isFlashing: false, isDetailOpen }))
}

const hudTexts = (): UiText[] => registeredUiTexts().filter((text) => text.id.startsWith('hud.'))
const labelWordsOf = (texts: readonly UiText[]) =>
  texts.reduce((words, text) => words + shownLabelWordsOf(text), 0)
const worstModel = () => everyReadoutOf(readHudModel())
const testIdIn = (html: string, id: string) => html.includes(`data-testid="${id}"`)

/** The model a step down the shaft: the strip's number turns to the depth. */
function underground(model: HudModel, depthTiles: number): HudModel {
  return { ...model, depth: { ...model.depth, depthTiles, text: String(depthTiles) } }
}

beforeEach(() => {
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => forgetUiTexts())

describe('HUD strip view (ticket 684)', () => {
  it('counts at most 6 label words on the strip in the worst state', () => {
    drawStrip(worstModel())
    expect(COMPACT_LABEL_WORDS_MAX).toBe(6)
    expect(labelWordsOf(hudTexts())).toBeLessThanOrEqual(COMPACT_LABEL_WORDS_MAX)
  })

  it('draws hull, fuel and cargo as dials and none of their numbers', () => {
    const model = worstModel()
    const html = drawStrip(model)
    for (const gauge of ['hull', 'fuel', 'cargo'])
      expect(testIdIn(html, UI_ID_TEMPLATES.hudDial(gauge))).toBe(true)
    expect(html).not.toContain(model.hull.text)
    expect(html).not.toContain(model.energy.text)
    expect(html).not.toContain(model.cargo.text)
  })

  it('reveals no dial number until a hover or a tap asks for it', () => {
    const html = drawStrip(underground(worstModel(), 116))
    for (const dial of ['hull', 'fuel', 'cargo', 'heat', 'depth'])
      expect(testIdIn(html, UI_ID_TEMPLATES.hudDialNumber(dial))).toBe(false)
  })

  it('draws the depth dial with the band and core marks of the planet underground', () => {
    const html = drawStrip(underground(readHudModel(), 40))
    expect(testIdIn(html, UI_ID_TEMPLATES.hudDial('depth'))).toBe(true)
    expect(html.match(/data-mark="band"/g)).toHaveLength(4)
    expect(html.match(/data-mark="core"/g)).toHaveLength(1)
  })

  it('folds the dials past a phone surface strip into one count', () => {
    const html = drawStrip(worstModel(), 'phone')
    expect(testIdIn(html, UI_ID_TEMPLATES.hudDial('cargo'))).toBe(true)
    expect(testIdIn(html, UI_ID_TEMPLATES.hudDial('depth'))).toBe(false)
    expect(testIdIn(html, UI_IDS.hudDialOverflow)).toBe(true)
    expect(testIdIn(drawStrip(worstModel()), UI_IDS.hudDialOverflow)).toBe(false)
  })

  it('names every dial and number for assistive tech, out of sight', () => {
    drawStrip(worstModel())
    const strip = hudTexts().filter((text) => text.id.startsWith('hud.strip.'))
    expect(strip.length).toBeGreaterThanOrEqual(5)
    expect(strip.every((text) => text.titlePlace === 'card' && text.title !== '')).toBe(true)
  })

  it('shows the money and the next-upgrade chip on the surface', () => {
    const model = { ...readHudModel(), money: amountReading(1234) }
    const html = drawStrip(model)
    expect(testIdIn(html, UI_IDS.hudStripMoney)).toBe(true)
    expect(testIdIn(html, UI_IDS.hudNextUpgrade)).toBe(true)
    expect(testIdIn(html, UI_IDS.hudStripDepth)).toBe(false)
  })

  it('shows the depth as the only number underground, with no chip and no money', () => {
    const model = underground({ ...readHudModel(), money: amountReading(1234) }, 116)
    const html = drawStrip(model)
    expect(html).toContain('116 m')
    expect(testIdIn(html, UI_IDS.hudNextUpgrade)).toBe(false)
    expect(testIdIn(html, UI_IDS.hudStripMoney)).toBe(false)
  })

  it('draws money at 1e15 on the odometer in six characters', () => {
    const html = drawStrip({ ...readHudModel(), money: amountReading(1e15) })
    expect(html).toContain('data-exact="1e+15"')
    expect(html.replace(/<[^>]*>/g, '')).toContain('1.00Qa')
  })

  it('draws the heat dial in the worst state and none off a heat planet', () => {
    expect(testIdIn(drawStrip(worstModel()), UI_ID_TEMPLATES.hudDial('heat'))).toBe(true)
    expect(testIdIn(drawStrip(readHudModel()), UI_ID_TEMPLATES.hudDial('heat'))).toBe(false)
  })

  it('shows at most three status chips of at most two words, the rest as a count', () => {
    const html = drawStrip(worstModel())
    const chips = hudTexts().filter((text) => text.id.startsWith('hud.chip.'))
    expect(chips.length).toBeLessThanOrEqual(MOST_STATUSES_SHOWN)
    expect(chips.every((chip) => wordCountOf(chip.title) <= COMPACT_CHIP_WORDS_MAX)).toBe(true)
    expect(html).toMatch(/data-hidden="[1-9]\d*"/)
  })

  it('shows UNDER WAY as the state icon alone while the vehicle is active', () => {
    const html = drawStrip(readHudModel())
    expect(readHudModel().vehicleState.mode).toBe('active')
    expect(testIdIn(html, UI_IDS.hudState)).toBe(true)
    expect(html).not.toContain('UNDER WAY')
  })

  it('shortens CARGO FULL to a one-word chip beside the cargo icon', () => {
    const model = readHudModel()
    const full = { ...model, cargo: { ...model.cargo, isFull: true } }
    const statuses = {
      ...full.statuses,
      secondary: [
        { id: 'cargo_full' as const, iconId: 'icon-status-cargo-full', text: 'CARGO FULL' },
      ],
    }
    const html = drawStrip({ ...full, statuses })
    const chip = hudTexts().find((text) => text.id === 'hud.chip.cargo_full')
    expect(chip?.title).toBe('FULL')
    expect(html).not.toContain('CARGO FULL')
  })

  it('draws every strip reading on a shared element within the text budget', () => {
    const html = drawStrip(worstModel())
    expect(unregisteredTextsOf(html)).toEqual([])
    expect(hudTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })
})

describe('HUD detail behind the gear (ticket 684)', () => {
  it('keeps the exact values and the words out of the HUD while the detail is closed', () => {
    const html = drawHud(worstModel())
    expect(testIdIn(html, UI_IDS.hudGear)).toBe(true)
    expect(testIdIn(html, UI_IDS.hudDetail)).toBe(false)
    expect(testIdIn(html, UI_IDS.hudEnergyText)).toBe(false)
    expect(testIdIn(html, UI_IDS.hudDepth)).toBe(false)
    // The banner's line; its title is the energy chip's out-of-sight name on desktop's six (685).
    expect(html).not.toContain('climb home now')
  })

  it('shows every exact value and word in the detail once the gear opens it', () => {
    const model = worstModel()
    const html = drawHud(model, true)
    expect(testIdIn(html, UI_IDS.hudDetail)).toBe(true)
    expect(html).toContain('aria-expanded="true"')
    for (const id of [UI_IDS.hudEnergyText, UI_IDS.hudHullText, UI_IDS.hudCargoText])
      expect(testIdIn(html, id)).toBe(true)
    expect(html).toContain('CRITICAL ENERGY')
    expect(html).toContain('Auto (G)')
    expect(html).toContain('2/4 (C)')
  })

  it('draws the open detail on shared elements within the text budget', () => {
    const html = drawHud(worstModel(), true)
    expect(unregisteredTextsOf(html)).toEqual([])
    expect(hudTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('leaves the full-density HUD exactly as it draws without a density', () => {
    const model = worstModel()
    const plain = renderToString(createElement(HudView, { model, isFlashing: false }))
    const full = renderToString(
      createElement(HudView, { model, isFlashing: false, density: 'full' }),
    )
    expect(full).toBe(plain)
  })
})
