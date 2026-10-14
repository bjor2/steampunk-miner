import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import {
  isWithinSceneLayerLine,
  KERNEL_SCENE_LAYER_BUDGET,
  sceneLayerLineUseOf,
  sceneLayers,
  type SceneLayerBudget,
} from './sceneLayers'

// The slices' scene layers share one seal-time draw envelope carved from #38's 150 draw calls
// (TD and GD lock on #213) with the kernel's always-on spray layer, which took dynamite-visuals'
// 96-piece debris pool (ticket 348): the line's total stays, only its split between the kernel and
// the slices moved. A fake slice declares a single layer of the given budget.

const sliceDrawing = (budget: SceneLayerBudget): SliceDefinition => ({
  id: 'budget-probe',
  register: (r) => r.sceneLayer({ id: 'budget-probe.layer', Layer: () => null, budget }),
})

const isWithinLineWith = (slices: readonly SliceDefinition[]) =>
  withRegistrations(slices, () => isWithinSceneLayerLine(sceneLayers()))

/** What the slices may draw together: the line less the kernel's spray. */
const SLICE_SHARE: SceneLayerBudget = {
  drawCalls: SCENE_LAYER_LINE.drawCalls - KERNEL_SCENE_LAYER_BUDGET.drawCalls,
  instances: SCENE_LAYER_LINE.instances - KERNEL_SCENE_LAYER_BUDGET.instances,
}

describe('scene layer budget', () => {
  it("keeps the loaded slices' layers within the scene-layer line", () => {
    expect(isWithinSceneLayerLine(sceneLayers())).toBe(true)
  })

  it('passes with no layer registered', () => {
    expect(isWithinLineWith([])).toBe(true)
  })

  it('keeps the line at 27 calls and 1088 pieces, the kernel spray holding one call and 96 of them', () => {
    expect(SCENE_LAYER_LINE).toEqual({ drawCalls: 27, instances: 1088 })
    expect(KERNEL_SCENE_LAYER_BUDGET).toEqual({ drawCalls: 1, instances: 96 })
  })

  it('counts the kernel spray against the line with no slice loaded', () => {
    expect(withRegistrations([], () => sceneLayerLineUseOf(sceneLayers()))).toEqual(
      KERNEL_SCENE_LAYER_BUDGET,
    )
  })

  it('passes a slice that draws exactly the line less the kernel spray', () => {
    expect(isWithinLineWith([sliceDrawing(SLICE_SHARE)])).toBe(true)
  })

  it('fails a slice that draws one call over the line less the kernel spray', () => {
    const budget = { ...SLICE_SHARE, drawCalls: SLICE_SHARE.drawCalls + 1 }
    expect(isWithinLineWith([sliceDrawing(budget)])).toBe(false)
  })

  it('fails a slice that places one instance over the line less the kernel spray', () => {
    const budget = { ...SLICE_SHARE, instances: SLICE_SHARE.instances + 1 }
    expect(isWithinLineWith([sliceDrawing(budget)])).toBe(false)
  })
})
