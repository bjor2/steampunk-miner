import { describe, expect, it } from 'vitest'
import { dockSiteOf } from './dockSite'
import { generateChunk, type GeneratedChunk } from './generateChunk'
import { bandOfTile } from './planetGeometry'
import { planetParamsFor, type PlanetParams } from './planetParams'
import {
  CHUNK_SAMPLES,
  ISO_DENSITY,
  SAMPLES_PER_TILE,
  SOLID_DENSITY,
  chunkOfSample,
  localSampleOf,
  sampleIndexOf,
} from './sampleGrid'
import { CHUNK_SIZE, cellIndexOfTile, chunkOfTile } from './tileGrid'
import { CELL_KIND, kindOfCell } from './worldCell'

const params = planetParamsFor(83921, 1)
const chunks = new Map<string, GeneratedChunk>()

function chunkAt(planet: PlanetParams, cx: number, cy: number): GeneratedChunk {
  const key = `${planet.worldSeed}:${planet.planetIndex}:${cx},${cy}`
  const chunk = chunks.get(key) ?? generateChunk(planet, cx, cy)
  chunks.set(key, chunk)
  return chunk
}

function densityAtSample(planet: PlanetParams, sx: number, sy: number): number {
  const { density } = chunkAt(planet, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

function cellAt(planet: PlanetParams, tx: number, ty: number): number {
  return chunkAt(planet, chunkOfTile(tx), chunkOfTile(ty)).cells[cellIndexOfTile(tx, ty)]
}

describe('generated density (#36)', () => {
  it('holds 128 x 128 samples per chunk', () => {
    expect(generateChunk(params, 2, -3).density).toHaveLength(CHUNK_SAMPLES)
    expect(CHUNK_SAMPLES).toBe(128 * 128)
  })

  it('is fully solid in plain band-1 ground away from the surface', () => {
    // Chunk (0, 8) holds rows 256 to 287; band 1 reaches down to row 276 under the dock.
    const { density } = generateChunk(params, 0, 8)
    for (let lsy = 4 * 21; lsy < 4 * CHUNK_SIZE; lsy++) {
      for (let lsx = 0; lsx < 4 * CHUNK_SIZE; lsx++) {
        expect(density[sampleIndexOf(lsx, lsy)]).toBe(SOLID_DENSITY)
      }
    }
    expect(bandOfTile(params, 0, 8 * CHUNK_SIZE + 21)).toBe(1)
  })

  it.each([0, 2, 5])(
    'crosses 128 exactly at the planet radius, a smooth surface (row %i)',
    (ty) => {
      const radiusSamples = params.radiusTiles * SAMPLES_PER_TILE
      const sy = ty * SAMPLES_PER_TILE
      const crossing = radiusSamplesAlongRow(sy)
      const exact = Math.sqrt(radiusSamples * radiusSamples - sy * sy)
      expect(Math.abs(crossing - exact)).toBeLessThanOrEqual(1)
    },
  )

  it('makes the dock pad solid and its clearance empty in every sample', () => {
    const site = dockSiteOf(params)
    for (let tx = site.firstColumn; tx <= site.lastColumn; tx++) {
      for (let q = 0; q < SAMPLES_PER_TILE; q++) {
        const sx = tx * SAMPLES_PER_TILE + q
        expect(densityAtSample(params, sx, site.padRow * SAMPLES_PER_TILE + q)).toBe(SOLID_DENSITY)
        expect(densityAtSample(params, sx, (site.padRow + 1) * SAMPLES_PER_TILE + q)).toBe(0)
        expect(densityAtSample(params, sx, site.clearanceTopRow * SAMPLES_PER_TILE + q)).toBe(0)
      }
    }
  })

  it('opens a cave tile exactly where its corner sample is at or under 128', () => {
    let caves = 0
    for (let ty = 100; ty < 140; ty++) {
      for (let tx = -40; tx < 40; tx++) {
        const isCave = kindOfCell(cellAt(params, tx, ty)) === CELL_KIND.air
        const corner = densityAtSample(params, tx * SAMPLES_PER_TILE, ty * SAMPLES_PER_TILE)
        expect(corner <= ISO_DENSITY, `tile ${tx},${ty}`).toBe(isCave)
        if (isCave) caves++
      }
    }
    expect(caves).toBeGreaterThan(0)
  })
})

/** Where density along sample row `sy`, coming in from space, rises through 128, interpolated. */
function radiusSamplesAlongRow(sy: number): number {
  let sx = (params.radiusTiles + 2) * SAMPLES_PER_TILE
  while (densityAtSample(params, sx, sy) < ISO_DENSITY) sx--
  const inside = densityAtSample(params, sx, sy)
  const outside = densityAtSample(params, sx + 1, sy)
  return sx + (inside - ISO_DENSITY) / (inside - outside)
}
