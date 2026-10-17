import { describe, expect, it } from 'vitest'
import { generateChunkCells } from './generateChunk'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { CHUNK_SIZE, firstTileOfChunk, surfaceRowOfColumn, type TilePoint } from './tileGrid'
import { cachedChunkCount, cellAt, EMPTY_WORLD } from './worldState'

/** The first tile down column 0 whose generated cell differs between the two params. */
function tileWhereCellsDiffer(a: PlanetParams, b: PlanetParams): TilePoint {
  const surfaceChunk = Math.floor(surfaceRowOfColumn(0, a.radiusTiles) / CHUNK_SIZE)
  for (let cy = surfaceChunk; cy >= 0; cy--) {
    const cellsOfA = generateChunkCells(a, 0, cy)
    const cellsOfB = generateChunkCells(b, 0, cy)
    const index = cellsOfA.findIndex((cell, at) => cell !== cellsOfB[at])
    if (index >= 0) return tileOfChunkIndex(cy, index)
  }
  throw new Error('the two params generate the same cells down column 0')
}

function tileOfChunkIndex(cy: number, index: number): TilePoint {
  return {
    tx: firstTileOfChunk(0) + (index % CHUNK_SIZE),
    ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
  }
}

describe('world state', () => {
  it('counts the generated chunks it holds for lookups (#121 memory sample)', () => {
    const params = planetParamsFor(83921, 1)
    cellAt(EMPTY_WORLD, params, { tx: 0, ty: 0 })
    const held = cachedChunkCount()
    cellAt(EMPTY_WORLD, params, { tx: 3 * CHUNK_SIZE, ty: 0 })
    cellAt(EMPTY_WORLD, params, { tx: 3 * CHUNK_SIZE, ty: 1 })
    expect(held).toBeGreaterThanOrEqual(1)
    expect(cachedChunkCount()).toBe(held + 1)
  })

  it('answers a legacy and a stamped planet of one seed and index with their own cells (ticket 445)', () => {
    const legacy = planetParamsFor(83921, 7)
    const stamped = planetParamsFor(83921, 7, 1)
    const tile = tileWhereCellsDiffer(legacy, stamped)
    const stampedCell = cellAt(EMPTY_WORLD, stamped, tile)
    const legacyCell = cellAt(EMPTY_WORLD, legacy, tile)
    expect(stampedCell).not.toBe(legacyCell)
    expect(cellAt(EMPTY_WORLD, stamped, tile)).toBe(stampedCell)
  })
})
