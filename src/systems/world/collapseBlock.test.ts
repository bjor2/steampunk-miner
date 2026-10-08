import { describe, expect, it } from 'vitest'
import { blockIdOf, blocksTouchingTile } from './collapseBlock'

// A block is 4x4 tiles and a chunk 8x8 blocks, so tile (5, 5) sits inside block (1, 1) of chunk
// 0,0 (index 9), tile 4 is a block's left or bottom edge and tile 0 a chunk's.
const idsTouching = (tx: number, ty: number, ring: 0 | 1) =>
  blocksTouchingTile({ tx, ty }, ring).map(blockIdOf)

describe('collapse blocks touching a tile (ticket 331)', () => {
  it('names only the containing block at ring 0, wherever the tile sits in it', () => {
    expect(idsTouching(5, 5, 0)).toEqual(['0,0#9'])
    expect(idsTouching(4, 4, 0)).toEqual(['0,0#9'])
    expect(idsTouching(7, 7, 0)).toEqual(['0,0#9'])
    expect(idsTouching(-1, -1, 0)).toEqual(['-1,-1#63'])
  })

  it('names only the containing block at ring 1 when all 8 neighbours share it', () => {
    expect(idsTouching(5, 5, 1)).toEqual(['0,0#9'])
    expect(idsTouching(6, 6, 1)).toEqual(['0,0#9'])
  })

  it('adds the block beside a tile on a block edge at ring 1', () => {
    expect(idsTouching(4, 5, 1)).toEqual(['0,0#8', '0,0#9'])
    expect(idsTouching(7, 5, 1)).toEqual(['0,0#9', '0,0#10'])
    expect(idsTouching(5, 4, 1)).toEqual(['0,0#1', '0,0#9'])
    expect(idsTouching(5, 7, 1)).toEqual(['0,0#9', '0,0#17'])
  })

  it('adds the three blocks round a tile on a block corner at ring 1', () => {
    expect(idsTouching(4, 4, 1)).toEqual(['0,0#0', '0,0#1', '0,0#8', '0,0#9'])
    expect(idsTouching(7, 7, 1)).toEqual(['0,0#9', '0,0#10', '0,0#17', '0,0#18'])
  })

  it('crosses into the neighbouring chunks at a chunk corner, in processing order', () => {
    expect(idsTouching(0, 0, 1)).toEqual(['-1,-1#63', '-1,0#7', '0,-1#56', '0,0#0'])
    expect(idsTouching(-1, -1, 1)).toEqual(['-1,-1#63', '-1,0#7', '0,-1#56', '0,0#0'])
  })
})
