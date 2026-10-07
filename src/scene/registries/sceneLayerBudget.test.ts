import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { isWithinSceneLayerLine, sceneLayers, type SceneLayerBudget } from './sceneLayers'

// The slices' scene layers share one seal-time draw envelope carved from #38's 150 draw calls
// (TD and GD lock on #213); a fake slice declares a single layer of the given budget.

const sliceDrawing = (budget: SceneLayerBudget): SliceDefinition => ({
  id: 'budget-probe',
  register: (r) => r.sceneLayer({ id: 'budget-probe.layer', Layer: () => null, budget }),
})

const isWithinLineWith = (slices: readonly SliceDefinition[]) =>
  withRegistrations(slices, () => isWithinSceneLayerLine(sceneLayers()))

describe('scene layer budget', () => {
  it("keeps the loaded slices' layers within the scene-layer line", () => {
    expect(isWithinSceneLayerLine(sceneLayers())).toBe(true)
  })

  it('passes with no layer registered', () => {
    expect(isWithinLineWith([])).toBe(true)
  })

  it('passes a slice that draws exactly the line', () => {
    expect(isWithinLineWith([sliceDrawing(SCENE_LAYER_LINE)])).toBe(true)
  })

  it('fails a slice that draws one call over the line', () => {
    const budget = { ...SCENE_LAYER_LINE, drawCalls: SCENE_LAYER_LINE.drawCalls + 1 }
    expect(isWithinLineWith([sliceDrawing(budget)])).toBe(false)
  })

  it('fails a slice that places one instance over the line', () => {
    const budget = { ...SCENE_LAYER_LINE, instances: SCENE_LAYER_LINE.instances + 1 }
    expect(isWithinLineWith([sliceDrawing(budget)])).toBe(false)
  })
})
