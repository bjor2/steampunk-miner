import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import {
  isWithinSceneLayerLine,
  sceneLayers,
  sceneLayersBudget,
} from '../../scene/registries/sceneLayers'
import { hudPanelsOf, overlayPanels } from '../../ui/registries/hudPanels'
import { slice } from './register'

// The reveal layer as the TD lock on #203 Q1 sizes it: one pooled draw call, at most 384
// instances, inside #213's line together with every other loaded slice's layers.

const LOCKED_MOST_INSTANCES = 384

describe('sensing scene layer', () => {
  it('draws the reveals in one call within the lock’s 384 instances', () => {
    const layers = withRegistrations([slice], sceneLayers)
    expect(layers.map((layer) => layer.id)).toEqual(['sensing.reveals'])
    expect(layers[0].budget.drawCalls).toBe(1)
    expect(layers[0].budget.instances).toBeLessThanOrEqual(LOCKED_MOST_INSTANCES)
  })

  it('fits the scene-layer line with every loaded slice’s layers', () => {
    expect(isWithinSceneLayerLine(sceneLayers())).toBe(true)
    expect(sceneLayersBudget(sceneLayers()).instances).toBeGreaterThan(0)
  })

  it('puts the periscope in the threats slot and the lens and barometer on the overlay', () => {
    withRegistrations([slice], () => {
      expect(hudPanelsOf('threats').map((panel) => panel.id)).toEqual(['sensing.periscope'])
      expect(overlayPanels().map((panel) => panel.id)).toEqual([
        'sensing.barometer',
        'sensing.lens',
      ])
    })
  })

  it('draws no layer or panel of its own with the slice removed', () => {
    withRegistrations([], () => {
      expect(sceneLayers()).toEqual([])
      expect(hudPanelsOf('threats')).toEqual([])
    })
  })
})
