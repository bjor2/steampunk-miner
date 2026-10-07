import { describe, expect, it } from 'vitest'
import { generateChunkCells } from './generateChunk'
import { isLavaPocketNear } from './lavaPockets'
import { bandOfTile, isInsidePlanet } from './planetGeometry'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk, type TilePoint } from './tileGrid'
import { CELL_KIND, kindOfCell } from './worldCell'

/** Lava and plain ground tiles per band across the whole planet. */
function lavaShareByBand(params: PlanetParams): { lava: number[]; ground: number[] } {
  const lava = [0, 0, 0, 0, 0]
  const ground = [0, 0, 0, 0, 0]
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      const cells = generateChunkCells(params, cx, cy)
      cells.forEach((cell, index) => {
        const tx = firstTileOfChunk(cx) + (index % CHUNK_SIZE)
        const ty = firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE)
        if (!isInsidePlanet(params, tx, ty)) return
        const band = bandOfTile(params, tx, ty) - 1
        if (kindOfCell(cell) === CELL_KIND.lava) lava[band] += 1
        if (kindOfCell(cell) === CELL_KIND.lava || kindOfCell(cell) === CELL_KIND.ground) {
          ground[band] += 1
        }
      })
    }
  }
  return { lava, ground }
}

describe('lava pockets (#113)', () => {
  const heat = lavaShareByBand(planetParamsFor(83921, 8))

  it('fills about each band its pocket volume of plain ground on planet 8, band 1 none', () => {
    const shares = heat.lava.map((lava, band) => lava / heat.ground[band])
    expect(shares[0]).toBe(0)
    ;[0.01, 0.02, 0.03, 0.04].forEach((volume, at) => {
      expect(shares[at + 1]).toBeGreaterThan(volume * 0.7)
      expect(shares[at + 1]).toBeLessThan(volume * 1.3)
    })
  })

  it('leaves the planets before the Fire act without lava', () => {
    expect(lavaShareByBand(planetParamsFor(83921, 7)).lava).toEqual([0, 0, 0, 0, 0])
  })

  it('paints the same pockets whichever chunk is generated first', () => {
    const params = planetParamsFor(83921, 8)
    const first = generateChunkCells(params, 1, 3)
    generateChunkCells(params, 0, 3)
    expect(generateChunkCells(params, 1, 3)).toEqual(first)
  })
})

/** The plain-ground and lava tiles of the first chunk on the planet that holds lava. */
function groundAndLavaOfFirstLavaChunk(params: PlanetParams): {
  ground: TilePoint[]
  lava: TilePoint[]
} {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      const tiles = groundAndLavaOf(params, cx, cy)
      if (tiles.lava.length > 0) return tiles
    }
  }
  throw new Error('no lava on the planet')
}

function groundAndLavaOf(params: PlanetParams, cx: number, cy: number) {
  const ground: TilePoint[] = []
  const lava: TilePoint[] = []
  generateChunkCells(params, cx, cy).forEach((cell, index) => {
    const tile = {
      tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
      ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
    }
    if (kindOfCell(cell) === CELL_KIND.lava) lava.push(tile)
    if (kindOfCell(cell) === CELL_KIND.ground) ground.push(tile)
  })
  return { ground, lava }
}

describe('the lava-pocket query (#232)', () => {
  const params = planetParamsFor(83921, 8)
  const { ground, lava } = groundAndLavaOfFirstLavaChunk(params)

  it('answers radius 0 with whether plain ground of the chunk was painted lava', () => {
    expect(lava.every((tile) => isLavaPocketNear(params, tile, 0))).toBe(true)
    expect(ground.some((tile) => isLavaPocketNear(params, tile, 0))).toBe(false)
  })

  it('counts a pocket tile whose centre lies exactly the radius away', () => {
    const [pocket] = lava
    expect(isLavaPocketNear(params, { tx: pocket.tx + 6, ty: pocket.ty }, 6)).toBe(true)
    expect(isLavaPocketNear(params, { tx: pocket.tx - 3, ty: pocket.ty + 4 }, 5)).toBe(true)
  })

  it('finds lava within the radius of every tile it says is near none', () => {
    const near = (tile: TilePoint) => isLavaPocketNear(params, tile, 2)
    const isLavaWithin2 = (tile: TilePoint) =>
      lava.some(({ tx, ty }) => (tx - tile.tx) ** 2 + (ty - tile.ty) ** 2 <= 4)
    expect(ground.filter((tile) => !near(tile)).some(isLavaWithin2)).toBe(false)
  })

  it('answers no on a planet before the Fire act', () => {
    expect(isLavaPocketNear(planetParamsFor(83921, 7), lava[0], 50)).toBe(false)
  })
})
