import { describe, expect, it } from 'vitest'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { withRegistrations } from '../../registries/registrar'
import {
  isWithinSceneLayerLine,
  sceneLayerLineUseOf,
  sceneLayers,
} from '../../scene/registries/sceneLayers'
import { slice } from './register'

// The magnet fields as the GD and TD rulings on #286 Q1 size them: one LineSegments, one draw
// call, at most 40 pieces, inside #213's line once it is raised by 40 to 1128, beside (never in)
// planet-mix's field lines.

const RULED_MOST_PIECES = 40
const RAISED_LINE_INSTANCES = 1128

describe('terrain-tools scene layer', () => {
  it('draws the magnet fields in one call within the ruling’s 40 pieces', () => {
    const layers = withRegistrations([slice], sceneLayers)
    expect(layers.map((layer) => layer.id)).toEqual(['terrain-tools.magnet-fields'])
    expect(layers[0].budget).toEqual({ drawCalls: 1, instances: RULED_MOST_PIECES })
  })

  it('fits the line, raised to 1128 for it, with every loaded slice’s layers', () => {
    expect(SCENE_LAYER_LINE.instances).toBe(RAISED_LINE_INSTANCES)
    expect(isWithinSceneLayerLine(sceneLayers())).toBe(true)
    const ids = sceneLayers().map((layer) => layer.id)
    expect(ids).toEqual(
      expect.arrayContaining(['terrain-tools.magnet-fields', 'planet-mix.field-lines']),
    )
    expect(sceneLayerLineUseOf(sceneLayers()).instances).toBeGreaterThan(1088)
  })

  it('draws no layer of its own with the slice removed', () => {
    expect(withRegistrations([], sceneLayers)).toEqual([])
  })
})
