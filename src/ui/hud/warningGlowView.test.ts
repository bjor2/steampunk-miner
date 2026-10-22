import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import type { HudModel } from '../../systems/views/hudModel'
import type { EdgeGlow } from '../../systems/views/warningWatch'
import { UI_IDS } from '../ids'
import { HudView } from './HudView'

// Ticket 685 (spec #678, GD lock): a warning is an edge glow plus the readout's pulsing icon and a
// bell, never a text box. The glow carries no HUD box, so it never counts against the coverage
// budget or sits over the shaft as a panel would.

function drawHud(model: HudModel, glow: EdgeGlow, isFlashing = true): string {
  return renderToString(createElement(HudView, { model, isFlashing, glow }))
}

/** The opening tag of the element carrying `testId`. */
function tagOf(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`)
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1)
}

/** The model with its hull this far down, as the gauge reads it. */
function withHullAt(model: HudModel, permille: number): HudModel {
  return { ...model, hull: { ...model.hull, permille } }
}

beforeEach(() => resetGameStore())

describe('warning glow on the HUD (ticket 685)', () => {
  it('draws the deepest tier and the readout it warns of along the screen edges', () => {
    const glow = tagOf(
      drawHud(readHudModel(), { tier: 'critical', readoutId: 'hull' }),
      UI_IDS.hudEdgeGlow,
    )
    expect(glow).toContain('data-tier="critical"')
    expect(glow).toContain('data-readout="hull"')
    expect(glow).toContain('data-pulsing="true"')
  })

  it('holds steady with flashes off and draws nothing while every reading is clear', () => {
    const steady = tagOf(
      drawHud(readHudModel(), { tier: 'low', readoutId: 'fuel' }, false),
      UI_IDS.hudEdgeGlow,
    )
    expect(steady).not.toContain('data-pulsing')
    const clear = tagOf(
      drawHud(readHudModel(), { tier: 'ok', readoutId: null }),
      UI_IDS.hudEdgeGlow,
    )
    expect(clear).toContain('data-tier="ok"')
  })

  it('is no HUD box and holds no words', () => {
    const html = drawHud(readHudModel(), { tier: 'empty', readoutId: 'cargo' })
    const glow = tagOf(html, UI_IDS.hudEdgeGlow)
    expect(glow).not.toContain('data-hud')
    expect(glow).toContain('aria-hidden="true"')
    expect(html).toContain(`${glow}</div>`)
  })

  it('marks the warning readout on the strip with its tier to pulse by, the others clear', () => {
    const html = drawHud(withHullAt(readHudModel(), 100), { tier: 'critical', readoutId: 'hull' })
    const hull = html.slice(html.lastIndexOf('<div', html.indexOf('data-dial="hull"')))
    expect(hull.slice(0, hull.indexOf('>'))).toContain('data-pulsing="true"')
    expect(hull.slice(0, hull.indexOf('>'))).toContain('data-tier="critical"')
    const fuel = html.slice(html.lastIndexOf('<div', html.indexOf('data-dial="fuel"')))
    expect(fuel.slice(0, fuel.indexOf('>'))).toContain('data-tier="ok"')
  })
})
