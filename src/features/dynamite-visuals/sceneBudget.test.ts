import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import {
  isWithinSceneLayerLine,
  KERNEL_SCENE_LAYER_BUDGET,
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

  it('draws the front in three pooled calls, its debris in the kernel spray at the same count (#213 pin)', () => {
    const front = withRegistrations([slice], sceneLayers).find((layer) =>
      layer.id.endsWith('.front'),
    )
    expect(front?.budget).toEqual({ drawCalls: 3, instances: 256 + 320 + 1 })
    expect(KERNEL_SCENE_LAYER_BUDGET).toEqual({ drawCalls: 1, instances: 96 })
  })

  it('draws no layer of its own with the slice removed', () => {
    expect(withRegistrations([], sceneLayers)).toEqual([])
  })
})
