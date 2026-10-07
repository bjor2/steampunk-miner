import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { resetGameStore } from '../../store/gameStore'
import { readTouchSituation } from '../../store/screenReads'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { TouchControls, TouchControlsView } from './TouchControls'

// A slice's `slots` panel is the power-up slot column inside the touch controls (#217); a fake
// slice registers one through withRegistrations, so no real slice is imported.

const PROBE_MARKUP = '<span data-testid="slots-probe">slots</span>'

function ProbePanel() {
  return createElement('span', { 'data-testid': 'slots-probe' }, 'slots')
}

const SLOTS_PROBE: SliceDefinition = {
  id: 'slots-probe',
  register: (r) => r.hudPanel({ id: 'slots-probe.column', slot: 'slots', Panel: ProbePanel }),
}

function touchMarkupWith(slices: readonly SliceDefinition[]): string {
  const view = createElement(TouchControlsView, {
    situation: readTouchSituation(),
    isLeftHanded: false,
  })
  return withRegistrations(slices, () => renderToString(view))
}

const testIdAt = (html: string, id: string) => html.indexOf(`data-testid="${id}"`)

beforeEach(() => resetGameStore())

describe('touch slots panel', () => {
  it('draws a slots panel inside the touch controls, after the cluster', () => {
    const html = touchMarkupWith([SLOTS_PROBE])
    expect(testIdAt(html, 'slots-probe')).toBeGreaterThan(
      testIdAt(html, DEVICE_UI_IDS.touchCluster),
    )
  })

  it('adds only the panel, and nothing while no panel is registered', () => {
    const withPanel = touchMarkupWith([SLOTS_PROBE])
    expect(withPanel.replace(PROBE_MARKUP, '')).toBe(touchMarkupWith([]))
    expect(touchMarkupWith([])).not.toContain('slots-probe')
  })

  it('draws no slots panel while the touch controls are hidden', () => {
    const hidden = withRegistrations([SLOTS_PROBE], () =>
      renderToString(createElement(TouchControls)),
    )
    expect(hidden).toBe('')
  })
})
