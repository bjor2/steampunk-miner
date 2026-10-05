import { describe, expect, it } from 'vitest'
import { artefactCacheTile } from './artefactCache'
import { generateChunkCells } from './generateChunk'
import { planetParamsFor } from './planetParams'
import { bandOfTile } from './planetGeometry'
import { cellIndexOfTile, chunkOfTile, chunkRangeOfDisc } from './tileGrid'
import { ARTEFACT_CACHE_CELL } from './worldCell'

const SEEDS = [1, 7, 83921, 4_000_000_000]

function cacheCellsOnPlanet(worldSeed: number, planetIndex: number): number {
  const params = planetParamsFor(worldSeed, planetIndex)
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  let count = 0
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      count += generateChunkCells(params, cx, cy).filter(
        (cell) => cell === ARTEFACT_CACHE_CELL,
      ).length
    }
  }
  return count
}

describe('artefact cache placement', () => {
  it('puts the same cache tile on planets 1 and 2 for the same seed', () => {
    for (const seed of SEEDS) {
      for (const planet of [1, 2]) {
        expect(artefactCacheTile(planetParamsFor(seed, planet))).toEqual(
          artefactCacheTile(planetParamsFor(seed, planet)),
        )
      }
    }
  })

  it('places the cache in band 3 on planet 1 and band 2 on planet 2', () => {
    for (const seed of SEEDS) {
      const first = planetParamsFor(seed, 1)
      const second = planetParamsFor(seed, 2)
      const onFirst = artefactCacheTile(first)
      const onSecond = artefactCacheTile(second)
      expect(bandOfTile(first, onFirst.tx, onFirst.ty)).toBe(3)
      expect(bandOfTile(second, onSecond.tx, onSecond.ty)).toBe(2)
    }
  })

  it('moves the cache with the seed', () => {
    const tiles = SEEDS.map((seed) => JSON.stringify(artefactCacheTile(planetParamsFor(seed, 1))))
    expect(new Set(tiles).size).toBe(SEEDS.length)
  })

  it('writes exactly one artefact_cache cell into the generated planet, at the cache tile', () => {
    expect(cacheCellsOnPlanet(83921, 1)).toBe(1)
    expect(cacheCellsOnPlanet(83921, 2)).toBe(1)
    const params = planetParamsFor(83921, 2)
    const tile = artefactCacheTile(params)
    const cells = generateChunkCells(params, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
    expect(cells[cellIndexOfTile(tile.tx, tile.ty)]).toBe(ARTEFACT_CACHE_CELL)
  })
})
