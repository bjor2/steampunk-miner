import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { UI_IDS } from '../ids'
import type { SlotPanel } from '../registries/hudPanels'
import { OverlayCard } from '../overlay/OverlayCard'
import { HudView } from './HudView'

// A slice's HUD panel draws in its slot, right after the slot's kernel component
// (feature-slices.md 3.14); a fake slice registers one through withRegistrations.

const PROBE_MARKUP = '<span data-testid="hud-probe">probe</span>'

function ProbePanel() {
  return createElement('span', { 'data-testid': 'hud-probe' }, 'probe')
}

const panelSliceOf = (slot: SlotPanel['slot']): SliceDefinition => ({
  id: 'hud-probe',
  register: (r) => r.hudPanel({ id: 'hud-probe.panel', slot, Panel: ProbePanel }),
})

const overlayProbeSlice: SliceDefinition = {
  id: 'hud-probe',
  register: (r) =>
    r.hudPanel({ id: 'hud-probe.overlay', slot: 'overlay', priority: 1, Panel: ProbePanel }),
}

function OverlayCardProbe() {
  return createElement(OverlayCard, { anchor: { x: 0, y: 0 }, children: PROBE_MARKUP })
}

const overlayCardSlice: SliceDefinition = {
  id: 'hud-probe',
  register: (r) =>
    r.hudPanel({ id: 'hud-probe.card', slot: 'overlay', priority: 1, Panel: OverlayCardProbe }),
}

function hudMarkupWith(slices: readonly SliceDefinition[]): string {
  return withRegistrations(slices, () =>
    renderToString(createElement(HudView, { model: readHudModel(), isFlashing: false })),
  )
}

const testIdAt = (html: string, id: string) => html.indexOf(`data-testid="${id}"`)

beforeEach(() => resetGameStore())

describe('HUD slice panels', () => {
  it("draws a banner panel after the banner's kernel markup and before the position panel", () => {
    const html = hudMarkupWith([panelSliceOf('banner')])
    const probe = testIdAt(html, 'hud-probe')
    expect(probe).toBeGreaterThan(testIdAt(html, UI_IDS.hudState))
    expect(probe).toBeLessThan(testIdAt(html, UI_IDS.hudDepth))
  })

  it('draws a gauges panel before the banner', () => {
    const html = hudMarkupWith([panelSliceOf('gauges')])
    expect(testIdAt(html, 'hud-probe')).toBeLessThan(testIdAt(html, UI_IDS.hudState))
  })

  it('adds only the panel to the HUD, and nothing while no panel is registered', () => {
    const withPanel = hudMarkupWith([panelSliceOf('threats')])
    expect(withPanel.replace(PROBE_MARKUP, '')).toBe(hudMarkupWith([]))
  })

  it('draws an overlay panel under every other slot, before the gauges', () => {
    const html = hudMarkupWith([overlayProbeSlice])
    expect(testIdAt(html, 'hud-probe')).toBeGreaterThanOrEqual(0)
    expect(testIdAt(html, 'hud-probe')).toBeLessThan(testIdAt(html, UI_IDS.hudEnergyGauge))
  })

  it('adds only the overlay layer and its panel, the first markup inside the HUD', () => {
    const withoutProbe = hudMarkupWith([overlayProbeSlice]).replace(PROBE_MARKUP, '')
    const withoutLayer = withoutProbe.replace(/<div[^>]*><\/div>/, '')
    expect(withoutLayer).toBe(hudMarkupWith([]))
  })

  it('draws no card before the browser seats it, so a server render shows none', () => {
    expect(hudMarkupWith([overlayCardSlice])).not.toContain('hud-probe')
  })
})
