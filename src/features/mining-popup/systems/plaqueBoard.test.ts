import { describe, expect, it } from 'vitest'
import type { OreFace } from './oreFace'
import {
  addDiscoveryToPlaque,
  EMPTY_PLAQUE_BOARD,
  plaquePhaseAt,
  plaqueShownAt,
  type NewMaterial,
} from './plaqueBoard'

function material(oreId: string): NewMaterial {
  const face: OreFace = {
    oreId,
    name: oreId,
    family: 'metal',
    gradeName: 'Raw',
    iconId: 'none',
    swatch: 'red',
  }
  return { face, unitPriceText: '0.5' }
}

const discover = (oreId: string, tick: number, board = EMPTY_PLAQUE_BOARD) =>
  addDiscoveryToPlaque(board, material(oreId), tick)

const namesOn = (board: typeof EMPTY_PLAQUE_BOARD, tick: number) =>
  plaqueShownAt(board, tick)?.materials.map((shown) => shown.face.oreId) ?? []

describe('new material plaque', () => {
  it('comes in over 0.25 s, holds 2.5 s and fades over 0.6 s, then clears with no input', () => {
    const board = discover('iron', 100)
    const plaque = plaqueShownAt(board, 100)!
    expect([114, 115, 264, 265].map((tick) => plaquePhaseAt(plaque, tick))).toEqual([
      'in',
      'hold',
      'hold',
      'fade',
    ])
    expect([namesOn(board, 300), namesOn(board, 301)]).toEqual([['iron'], []])
  })

  it('lists a discovery that lands while it is up under the first, with no queue', () => {
    const board = discover('copper', 150, discover('iron', 100))
    expect(namesOn(board, 150)).toEqual(['iron', 'copper'])
    expect(plaqueShownAt(board, 150)!.serial).toBe(0)
  })

  it('stays up for a full hold and fade after a joining discovery', () => {
    const board = discover('copper', 200, discover('iron', 100))
    expect(plaqueShownAt(board, 200)!.endsTick).toBe(200 + 150 + 36)
  })

  it('is never on screen more than 6 s from its first appearance', () => {
    let board = discover('iron', 0)
    for (let tick = 60; tick <= 330; tick += 30) board = discover(`ore${tick}`, tick, board)
    expect(namesOn(board, 359)).toHaveLength(11)
    expect(namesOn(board, 360)).toEqual([])
  })

  it('shows a later discovery on a plaque of its own once the last one cleared', () => {
    const board = discover('copper', 400, discover('iron', 100))
    expect(namesOn(board, 400)).toEqual(['copper'])
    expect(plaqueShownAt(board, 400)!.serial).toBe(1)
  })
})
