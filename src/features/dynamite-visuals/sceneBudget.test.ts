import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import {
  isWithinSceneLayerLine,
  KERNEL_SCENE_LAYER_BUDGET,
  sceneLayerLineUseOf,
  sceneLayers,
  sceneLayersBudget,
} from '../../scene/registries/sceneLayers'
import { slice } from './register'

/** Every loaded slice's layers: the test setup loads the features, so the registry holds them all. */
const loadedSceneLayers = () => sceneLayers()

describe('dynamite-visuals scene layers', () => {
  it('declares the planted charges, the blast front and the marks within the scene-layer line', () => {
    const layers = withRegistrations([slice], sceneLayers)
    expect(layers.map((layer) => layer.id)).toEqual([
      'dynamite-visuals.front',
      'dynamite-visuals.marks',
      'dynamite-visuals.planted',
    ])
    expect(isWithinSceneLayerLine(layers)).toBe(true)
    expect(sceneLayersBudget(layers).drawCalls).toBeLessThanOrEqual(SCENE_LAYER_LINE.drawCalls)
  })

  it('draws the front in three pooled calls, its debris in the kernel spray at the same count (#213 pin)', () => {
    const front = withRegistrations([slice], sceneLayers).find((layer) =>
      layer.id.endsWith('.front'),
    )
    // The dust pool is the fire pool's size since D7 (ticket 866) carved the marks from its 64.
    expect(front?.budget).toEqual({ drawCalls: 3, instances: 256 + 256 + 1 })
    expect(KERNEL_SCENE_LAYER_BUDGET).toEqual({ drawCalls: 1, instances: 96 })
  })

  it('draws the marks in a call per spark type plus the rings and the decals, within what the dust gave up (D7 #866)', () => {
    const marks = withRegistrations([slice], sceneLayers).find((layer) =>
      layer.id.endsWith('.marks'),
    )
    expect(marks?.budget).toEqual({ drawCalls: 2 + 3, instances: 4 + 6 * 2 + 3 * 14 })
    expect(marks!.budget.instances).toBeLessThanOrEqual(320 - 256)
  })

  it('keeps every slice inside the scene-layer line with the marks added', () => {
    const layers = loadedSceneLayers()
    expect(isWithinSceneLayerLine(layers)).toBe(true)
    expect(sceneLayerLineUseOf(layers).instances).toBeLessThanOrEqual(SCENE_LAYER_LINE.instances)
  })

  it('draws no layer of its own with the slice removed', () => {
    expect(withRegistrations([], sceneLayers)).toEqual([])
  })
})
