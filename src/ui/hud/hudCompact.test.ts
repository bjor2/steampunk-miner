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
import type { HudModel } from '../../systems/views/hudModel'
import { forgetUiTexts, registeredUiTexts, type UiText } from '../../systems/views/uiText'
import { uiTextProblemsOf, wordCountOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { GaugeCluster } from './GaugeCluster'
import { HudBanner } from './HudBanner'
import { everyReadoutOf } from './hudFixtures'
import { HudView } from './HudView'
import { PositionPanel } from './PositionPanel'

// #500 GD ruling 4: the persistent top HUD of a phone shows at most 6 label words, counted over
// the registry entries its gauges, status row and readouts draw, in the worst state the model
// can hold (every warning, every readout, more statuses than fit).

/** The persistent top HUD alone, compact: what a phone shows while drilling. */
function drawTopHud(model: HudModel): string {
  return [
    createElement(GaugeCluster, { model, density: 'compact' }),
    createElement(HudBanner, { model, isFlashing: false, density: 'compact' }),
    createElement(PositionPanel, { model, density: 'compact' }),
  ]
    .map((element) => renderToString(element))
    .join('')
}

const hudTexts = (): UiText[] => registeredUiTexts().filter((text) => text.id.startsWith('hud.'))
const labelWordsOf = (texts: readonly UiText[]) =>
  texts.reduce((words, text) => words + shownLabelWordsOf(text), 0)
const worstModel = () => everyReadoutOf(readHudModel())

beforeEach(() => {
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => forgetUiTexts())

describe('compact HUD (#500)', () => {
  it('counts at most 6 label words in the persistent top HUD in the worst state', () => {
    drawTopHud(worstModel())
    expect(COMPACT_LABEL_WORDS_MAX).toBe(6)
    expect(labelWordsOf(hudTexts())).toBeLessThanOrEqual(COMPACT_LABEL_WORDS_MAX)
  })

  it('gives every gauge and readout an icon and no label word, the name kept for the card', () => {
    drawTopHud(worstModel())
    const readings = hudTexts().filter((text) => !text.id.startsWith('hud.chip.'))
    expect(readings.length).toBeGreaterThan(8)
    expect(readings.every((text) => text.titlePlace === 'card')).toBe(true)
    expect(readings.every((text) => text.title !== '')).toBe(true)
  })

  it('shows at most three chips of at most two words, the rest as a count', () => {
    const html = drawTopHud(worstModel())
    const chips = hudTexts().filter((text) => text.id.startsWith('hud.chip.'))
    expect(chips.length).toBeLessThanOrEqual(MOST_STATUSES_SHOWN)
    expect(chips.every((chip) => wordCountOf(chip.title) <= COMPACT_CHIP_WORDS_MAX)).toBe(true)
    expect(html).toMatch(/data-hidden="[1-9]\d*"/)
  })

  it('shows UNDER WAY as the state icon alone while the vehicle is active', () => {
    const html = drawTopHud(readHudModel())
    expect(readHudModel().vehicleState.mode).toBe('active')
    expect(html).toContain('data-testid="hud-state"')
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
    const html = drawTopHud({ ...full, statuses })
    const chip = hudTexts().find((text) => text.id === 'hud.chip.cargo_full')
    expect(chip?.title).toBe('FULL')
    expect(html).not.toContain('CARGO FULL')
  })

  it('never puts a banner word and a gauge number in one box', () => {
    const html = drawTopHud(worstModel())
    const gauges = html.slice(0, html.indexOf('data-hud="status"'))
    expect(gauges).not.toContain('FULL')
    expect(gauges).not.toContain('THROTTLED')
  })

  it('draws every compact reading on a shared element within the text budget', () => {
    const html = drawTopHud(worstModel())
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
    expect(plain).toContain('CRITICAL ENERGY')
  })
})
