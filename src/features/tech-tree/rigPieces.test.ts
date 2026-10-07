import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { isWithinSceneLayerLine, sceneLayers } from '../../scene/registries/sceneLayers'
import { vehiclePieces } from '../../scene/registries/vehiclePieces'
import { resetGameStore } from '../../store/gameStore'
import { slice } from './register'
import { RigGearPiece } from './scene/RigGearPiece'

beforeEach(() => {
  resetGameStore()
})

describe('tech tree: the rig piece and the effects layer (ticket 250)', () => {
  it('hangs the rig gear on the car and draws the power-up effects as a scene layer', () => {
    withRegistrations([slice], () => {
      expect(vehiclePieces().map((piece) => piece.id)).toEqual(['tech-tree.rig-gear'])
      expect(sceneLayers().map((layer) => layer.id)).toEqual(['tech-tree.power-up-fx'])
    })
  })

  it('draws the effects in four pooled calls within the scene-layer line, beside the other slices', () => {
    const fx = withRegistrations([slice], sceneLayers)[0]
    expect(fx?.budget).toEqual({ drawCalls: 4, instances: 4 * 64 })
    expect(isWithinSceneLayerLine(sceneLayers())).toBe(true)
  })

  it('draws nothing on a vehicle that owns no items, so the car stays as before', () => {
    expect(renderToString(createElement(RigGearPiece))).toBe('')
  })
})
