import { describe, expect, it } from 'vitest'
import { casingRingAround, lineRing } from '../world/casingLining'
import { clearDisc } from '../world/groundEdit'
import { isLavaAt } from '../world/lavaFlow'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../world/tileGrid'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
  type WorldState,
} from '../world/worldState'
import { buildChunkTileBatch, TILE_STYLE, type ChunkTileBatch } from './chunkTileBatch'
import { chunkDensityHaloOf } from './densityHalo'
import { refractoryCellsOf } from './refractoryCells'

const params = planetParamsFor(83921, 8)
const REFRACTORY = 1

function batchOf(world: WorldState, cx: number, cy: number): ChunkTileBatch {
  const halo = chunkDensityHaloOf((x, y) => currentDensityOfChunk(world, params, x, y), cx, cy)
  const cells = materialCellsOfChunk(world, params, cx, cy)
  const refractory = refractoryCellsOf(currentCasingOfChunk(world, cx, cy))
  return buildChunkTileBatch(params, cx, cy, cells, halo, refractory)
}

function stylesAt(world: WorldState, tx: number, ty: number): number[] {
  const batch = batchOf(world, chunkOfTile(tx), chunkOfTile(ty))
  const lx = tx - firstTileOfChunk(chunkOfTile(tx))
  const ly = ty - firstTileOfChunk(chunkOfTile(ty))
  for (let at = 0; at < batch.count; at++) {
    if (batch.tiles[at * 2] === lx && batch.tiles[at * 2 + 1] === ly) {
      return [...batch.styles.subarray(at * 4, at * 4 + 2)]
    }
  }
  return []
}

function firstLavaTile(): { tx: number; ty: number } {
  for (let ty = 300; ty > 100; ty--) {
    for (let tx = -40; tx <= 40; tx++)
      if (isLavaAt(EMPTY_WORLD, params, { tx, ty })) return { tx, ty }
  }
  throw new Error('no lava on planet 8')
}

describe('heat planet tiles (#113 Visibility)', () => {
  it('draws a lava cell in the lava style', () => {
    const lava = firstLavaTile()
    expect(stylesAt(EMPTY_WORLD, lava.tx, lava.ty)[0]).toBe(TILE_STYLE.lava)
  })

  it('flags the wall cells of a refractory ring, and not those of a standard one', () => {
    const centre = { xMm: 20500, yMm: 500500 }
    const hole = clearDisc(
      EMPTY_WORLD,
      params,
      { ...centre, radiusMm: 950, floorRadiusMm: null },
      255,
    )
    const ring = casingRingAround(centre.xMm, centre.yMm)
    const refractory = lineRing(hole.world, params, ring, 3, REFRACTORY).world
    const standard = lineRing(hole.world, params, ring, 3).world
    const wall = { tx: 20, ty: 501 }
    expect(stylesAt(refractory, wall.tx, wall.ty)).toEqual([TILE_STYLE.ground, 1])
    expect(stylesAt(standard, wall.tx, wall.ty)).toEqual([TILE_STYLE.ground, 0])
  })

  it('marks no cell of a chunk with no lining', () => {
    const marks = refractoryCellsOf(currentCasingOfChunk(EMPTY_WORLD, 0, 15))
    expect(marks.every((mark) => mark === 0)).toBe(true)
    expect(marks).toHaveLength(CHUNK_SIZE * CHUNK_SIZE)
  })
})
