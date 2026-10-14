import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GunPanelModel } from '../store/fireTileReads'
import { FireGaugeView } from './FireGauge'

// The desktop gauge as drawn (ticket 314): the ring, the fire key's hint, and the lamp only once
// the steam sear is researched.

const READY: GunPanelModel = {
  recoveryFilledPercent: 100,
  isRecovering: false,
  lamp: null,
  fireKeyText: 'Left Mouse',
}

function drawn(panel: GunPanelModel): string {
  return renderToString(createElement(FireGaugeView, { panel }))
}

describe('ground-gun: the desktop fire gauge', () => {
  it('names the fire key and draws no lamp before the sear is researched', () => {
    const html = drawn(READY)
    expect(html).toContain('data-testid="ground-gun-fire-gauge"')
    expect(html).toContain('Fire (Left Mouse)')
    expect(html).not.toContain('ground-gun-fire-lamp')
  })

  it('draws the lamp in its colour with its words once the sear is researched', () => {
    const lamp = { colour: 'amber' as const, label: 'Auto: no target', hold: 'no_target' as const }
    const html = drawn({ ...READY, lamp: { ...lamp, text: 'Auto: no target (T)' } })
    expect(html).toContain('data-lamp="amber"')
    expect(html).toContain('Bore gun auto: Auto: no target (T)')
  })

  it('marks the gauge while the gun recovers', () => {
    expect(drawn({ ...READY, recoveryFilledPercent: 40, isRecovering: true })).toContain(
      'data-recovering="true"',
    )
  })
})
