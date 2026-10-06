import { describe, expect, it } from 'vitest'
import { generateChunkCells } from './generateChunk'
import { bandOfTile, isInsidePlanet } from './planetGeometry'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk } from './tileGrid'
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
