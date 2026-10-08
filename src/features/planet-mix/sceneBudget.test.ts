import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import {
  isWithinSceneLayerLine,
  sceneLayers,
  sceneLayersBudget,
} from '../../scene/registries/sceneLayers'
import { registeredArtAssets } from '../../systems/registries/artAssets'
import { planetSkyBandOf } from '../../systems/registries/planetSkyBand'
import { planetParamsFor } from '../../systems/world/planetParams'
import { slice } from './register'

// The field lines as the GD ruling on #293 Q1 sizes them: one LineSegments, one draw call, at most
// 63 arcs, inside #213's line once it is raised by 64 to 1088; the aurora on the kernel's sky band,
// outside that line.

const RULED_MOST_ARCS = 63
const RAISED_LINE_INSTANCES = 1088

describe('planet-mix scene layer', () => {
  it('draws the field lines in one call within the ruling’s 63 arcs', () => {
    const layers = withRegistrations([slice], sceneLayers)
    expect(layers.map((layer) => layer.id)).toEqual(['planet-mix.field-lines'])
    expect(layers[0].budget).toEqual({ drawCalls: 1, instances: RULED_MOST_ARCS })
  })

  it('fits the line, raised to 1088 for it, with every loaded slice’s layers', () => {
    expect(SCENE_LAYER_LINE.instances).toBe(RAISED_LINE_INSTANCES)
    expect(isWithinSceneLayerLine(sceneLayers())).toBe(true)
    expect(sceneLayers().map((layer) => layer.id)).toContain('planet-mix.field-lines')
    expect(sceneLayersBudget(sceneLayers()).instances).toBeGreaterThan(1024)
  })

  it('ships the aurora ribbon and the field dash as one prop asset', () => {
    const assets = withRegistrations([slice], registeredArtAssets)
    expect(assets).toEqual([
      { id: 'prop-magnetic-field', category: 'prop', parts: ['aurora-ribbon', 'field-dash'] },
    ])
  })

  it('draws no layer, band or asset of its own with the slice removed', () => {
    withRegistrations([], () => {
      expect(sceneLayers()).toEqual([])
      expect(registeredArtAssets()).toEqual([])
      expect(planetSkyBandOf(planetParamsFor(83921, 25))).toBeNull()
    })
  })
})
