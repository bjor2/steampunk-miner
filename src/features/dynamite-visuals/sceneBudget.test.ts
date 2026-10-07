import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import {
  isWithinSceneLayerLine,
  sceneLayers,
  sceneLayersBudget,
} from '../../scene/registries/sceneLayers'
import { slice } from './register'

describe('dynamite-visuals scene layers', () => {
  it('declares the planted charges and the blast front within the scene-layer line', () => {
    const layers = withRegistrations([slice], sceneLayers)
    expect(layers.map((layer) => layer.id)).toEqual([
      'dynamite-visuals.front',
      'dynamite-visuals.planted',
    ])
    expect(isWithinSceneLayerLine(layers)).toBe(true)
    expect(sceneLayersBudget(layers).drawCalls).toBeLessThanOrEqual(SCENE_LAYER_LINE.drawCalls)
  })

  it('draws the front in four pooled calls, its debris one of them (#213 pin)', () => {
    const front = withRegistrations([slice], sceneLayers).find((layer) =>
      layer.id.endsWith('.front'),
    )
    expect(front?.budget).toEqual({ drawCalls: 4, instances: 256 + 320 + 96 + 1 })
  })

  it('draws no layer of its own with the slice removed', () => {
    expect(withRegistrations([], sceneLayers)).toEqual([])
  })
})
