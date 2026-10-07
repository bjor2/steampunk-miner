import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { feedbackCuesOf } from '../systems/feedback/feedbackCues'
import { sceneLayers, sceneLayersBudget } from './registries/sceneLayers'
import { SceneLayers } from './SceneLayers'

// A slice draws in the world scene through a registered layer and sizes a blast's kick through
// the blast cue provider (#213); a fake slice registers both through withRegistrations.

const probeLayerOf = (name: string) =>
  function ProbeLayer() {
    return createElement('i', { 'data-layer': name })
  }

const blastProbe: SliceDefinition = {
  id: 'blast-probe',
  register: (r) => {
    r.sceneLayer({
      id: 'blast-probe.ring',
      Layer: probeLayerOf('ring'),
      budget: { drawCalls: 1, instances: 96 },
    })
    r.sceneLayer({
      id: 'blast-probe.dust',
      Layer: probeLayerOf('dust'),
      budget: { drawCalls: 0, instances: 64 },
    })
    r.chargeBlastCue({
      id: 'blast-probe.cue',
      kickOf: (detonated) => ({ shake: 1, flash: 0.5, thumpDelayTicks: detonated.size }),
    })
  },
}

const DETONATED: DomainEvent = {
  tick: 720,
  playerId: 'p1',
  type: 'ChargeDetonated',
  tx: 3,
  ty: 280,
  size: 6,
  radiusMm: 10000,
}

const sceneLayersMarkupWith = (slices: readonly SliceDefinition[]) =>
  withRegistrations(slices, () => renderToString(createElement(SceneLayers)))

describe('scene layers', () => {
  it('draws nothing with no layer registered, so the scene stays as it is on main', () => {
    expect(sceneLayersMarkupWith([])).toBe('')
  })

  it("draws a slice's layers in id order", () => {
    expect(sceneLayersMarkupWith([blastProbe])).toBe(
      '<i data-layer="dust"></i><i data-layer="ring"></i>',
    )
  })

  it("kicks a blast with the same slice's cue provider", () => {
    const cues = withRegistrations([blastProbe], () => feedbackCuesOf([DETONATED], 'p1'))
    expect(cues).toEqual([
      { kind: 'chargeBlast', kick: { shake: 1, flash: 0.5, thumpDelayTicks: 6 } },
    ])
  })

  it('adds up what every registered layer draws at most', () => {
    const total = withRegistrations([blastProbe], () => sceneLayersBudget(sceneLayers()))
    expect(total).toEqual({ drawCalls: 1, instances: 160 })
  })

  it('draws nothing at all with no layer registered', () => {
    expect(withRegistrations([], () => sceneLayersBudget(sceneLayers()))).toEqual({
      drawCalls: 0,
      instances: 0,
    })
  })
})
