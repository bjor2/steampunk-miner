import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { shownLabelWordsOf } from '../../systems/views/hudCompact'
import type { HudModel } from '../../systems/views/hudModel'
import type { StageOrientation } from '../../systems/views/screenLayout'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { HudBanner } from './HudBanner'
import { everyReadoutOf } from './hudFixtures'
import { HudView } from './HudView'
import { PositionPanel } from './PositionPanel'

// #486: the compact HUD's status row is glyphs and numbers, its readings leave their bracketed
// control to the card, and held upright the threats are chips in the prompts' row instead of
// markers at the screen's edge. The full HUD draws as before.

const MARKUP_TOKEN = /<\/[^>]*>|<[a-zA-Z][^>]*>|[^<]+/g
const VOID_TAG = /^<(?:br|img|input|hr|meta|link|source|path|circle|rect|use)\b|\/>$/

/** Each `data-hud` box of the markup and the nearest `data-hud` box it is drawn inside. */
function hudBoxParentsOf(html: string): { id: string; parent: string | null }[] {
  const open: (string | null)[] = []
  const boxes: { id: string; parent: string | null }[] = []
  for (const token of html.match(MARKUP_TOKEN) ?? []) {
    if (token.startsWith('</')) open.pop()
    else if (token.startsWith('<') && !VOID_TAG.test(token)) open.push(boxIdOf(token, open, boxes))
  }
  return boxes
}

function boxIdOf(
  tag: string,
  open: readonly (string | null)[],
  boxes: { id: string; parent: string | null }[],
): string | null {
  const id = /\sdata-hud="([^"]+)"/.exec(tag)?.[1] ?? null
  const parent = [...open].reverse().find((each) => each !== null) ?? null
  if (id !== null) boxes.push({ id, parent })
  return id
}

function drawHud(model: HudModel, orientation: StageOrientation): string {
  return renderToString(
    createElement(HudView, { model, isFlashing: false, density: 'compact', orientation }),
  )
}

const worstModel = () => everyReadoutOf(readHudModel())
const chipTexts = () => registeredUiTexts().filter((text) => text.id.startsWith('hud.chip.'))

beforeEach(() => {
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => forgetUiTexts())

describe('compact HUD rows (#486)', () => {
  it('draws each status chip as its icon and number, its words kept for the card', () => {
    renderToString(
      createElement(HudBanner, { model: worstModel(), isFlashing: false, density: 'compact' }),
    )
    const chips = chipTexts()
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((chip) => chip.titlePlace === 'card' && chip.title !== '')).toBe(true)
    expect(chips.reduce((words, chip) => words + shownLabelWordsOf(chip), 0)).toBe(0)
  })

  it('leaves the guns and charges controls to the card on the closed compact readouts', () => {
    const draw = (density: 'compact' | 'full') =>
      renderToString(createElement(PositionPanel, { model: worstModel(), density }))
    const compact = draw('compact')
    expect(compact).toContain('Auto')
    expect(compact).not.toContain('Auto (G)')
    expect(compact).not.toContain('2/4 (C)')
    expect(draw('full')).toContain('Auto (G)')
  })
})

describe('compact HUD held upright (#486)', () => {
  it('draws every threat as a chip inside the prompts row', () => {
    const model = worstModel()
    const threats = hudBoxParentsOf(drawHud(model, 'portrait')).filter((box) => box.id === 'threat')
    expect(threats).toHaveLength(model.threats.length)
    expect(threats.every((box) => box.parent === 'prompts')).toBe(true)
  })

  it('leads the prompts row with the threats while no prompt is up', () => {
    const quiet = {
      ...worstModel(),
      dockPrompt: { isShown: false, text: '' },
      cachePrompt: { isShown: false, text: '' },
      readyPrompt: { isShown: false, text: '' },
      isDebugRun: false,
    }
    const boxes = hudBoxParentsOf(drawHud(quiet, 'portrait'))
    expect(boxes.filter((box) => box.parent === 'prompts').map((box) => box.id)).toEqual(['threat'])
  })

  it('keeps the threat markers at the screen edge held sideways', () => {
    const boxes = hudBoxParentsOf(drawHud(worstModel(), 'landscape'))
    const threats = boxes.filter((box) => box.id === 'threat')
    expect(threats.length).toBeGreaterThan(0)
    expect(threats.every((box) => box.parent === null)).toBe(true)
  })

  it('draws every upright text on a shared element', () => {
    expect(unregisteredTextsOf(drawHud(worstModel(), 'portrait'))).toEqual([])
  })

  it('draws the sideways and full HUD exactly as they draw without an orientation', () => {
    const model = worstModel()
    for (const density of ['compact', 'full'] as const) {
      const plain = renderToString(createElement(HudView, { model, isFlashing: false, density }))
      const sideways = renderToString(
        createElement(HudView, { model, isFlashing: false, density, orientation: 'landscape' }),
      )
      expect(sideways).toBe(plain)
    }
  })
})
