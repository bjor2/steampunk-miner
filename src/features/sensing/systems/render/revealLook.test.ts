import { describe, expect, it } from 'vitest'
import type { RevealBoard } from '../revealBoard'
import { BUOY_PIN_COLOUR, GATE_COLOURS, MARK_COLOURS, revealQuadsOf } from './revealLook'

// How the reveal layer draws a board (#203): a tile-sized quad per marked cell at the tile's
// centre, a gate badge in its gate's colour, and the buoy pins first, as smaller turned diamonds.

const BOARD: RevealBoard = {
  pins: [{ tile: { tx: 4, ty: -2 }, ownerId: 'p2', placedTick: 1, ringTiles: 4, inside: [] }],
  marks: [
    { tile: { tx: 0, ty: 0 }, kind: 'cave', gate: null, bornTick: 1, untilTick: 9 },
    { tile: { tx: 1, ty: 0 }, kind: 'gate', gate: 'dynamite', bornTick: 1, untilTick: 9 },
  ],
}

describe('sensing reveal look', () => {
  it('draws the pins before the marks, each at its tile’s centre', () => {
    const quads = revealQuadsOf(BOARD)
    expect(quads.map(({ x, y }) => [x, y])).toEqual([
      [4.5, -1.5],
      [0.5, 0.5],
      [1.5, 0.5],
    ])
  })

  it('colours a gated cell by its gate and a pin in brass', () => {
    expect(revealQuadsOf(BOARD).map((quad) => quad.colour)).toEqual([
      BUOY_PIN_COLOUR,
      MARK_COLOURS.cave,
      GATE_COLOURS.dynamite,
    ])
  })

  it('gives every mark kind and gate its own colour', () => {
    const colours = [
      ...Object.values(MARK_COLOURS),
      ...Object.values(GATE_COLOURS),
      BUOY_PIN_COLOUR,
    ]
    expect(new Set(colours).size).toBe(colours.length)
  })
})
