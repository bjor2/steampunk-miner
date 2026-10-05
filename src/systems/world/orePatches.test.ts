import { describe, expect, it } from 'vitest'
import { baseCellOfTile, generateBaseTerrain } from './baseTerrain'
import { dockGuaranteeCount, isInDockCone } from './dockGuarantee'
import { dockSiteOf } from './dockSite'
import { generateChunk } from './generateChunk'
import { bandPatchesInBox } from './orePatches'
import { bandOfTile } from './planetGeometry'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { CHUNK_SIZE, cellIndexOfTile, chunkOfTile, chunkRangeOfDisc } from './tileGrid'
import { CELL_KIND, kindOfCell, tierOffsetOfCell } from './worldCell'

// Decision #42 acceptance, on the golden seed's planets 1 and 2.
interface PlanetOre {
  /** Solid non-core tiles (ground or ore) per band 1..5. */
  solidByBand: number[]
  oreByBand: number[]
  /** Connected ore patch sizes (4-neighbour, one band) per band 1..5. */
  patchSizesByBand: number[][]
  oreTiles: Map<string, number>
}

const MEANS = [12, 16, 20, 24, 28]
const DENSITIES = [0.1, 0.14, 0.18, 0.2, 0.22]

function planetOreOf(params: PlanetParams): PlanetOre {
  const ore: PlanetOre = {
    solidByBand: [0, 0, 0, 0, 0],
    oreByBand: [0, 0, 0, 0, 0],
    patchSizesByBand: [[], [], [], [], []],
    oreTiles: new Map(),
  }
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) countChunk(ore, params, cx, cy)
  }
  ore.patchSizesByBand = patchSizesOf(ore.oreTiles)
  return ore
}

function countChunk(ore: PlanetOre, params: PlanetParams, cx: number, cy: number): void {
  generateChunk(params, cx, cy).cells.forEach((cell, index) => {
    const kind = kindOfCell(cell)
    if (kind !== CELL_KIND.ground && kind !== CELL_KIND.ore) return
    const tx = cx * CHUNK_SIZE + (index % CHUNK_SIZE)
    const ty = cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE)
    const band = bandOfTile(params, tx, ty)
    ore.solidByBand[band - 1]++
    if (kind !== CELL_KIND.ore) return
    ore.oreByBand[band - 1]++
    ore.oreTiles.set(`${tx},${ty}`, tierOffsetOfCell(cell))
  })
}

function patchSizesOf(oreTiles: Map<string, number>): number[][] {
  const sizes: number[][] = [[], [], [], [], []]
  const seen = new Set<string>()
  for (const [key, tierOffset] of oreTiles) {
    if (seen.has(key)) continue
    seen.add(key)
    sizes[tierOffset].push(floodSize(oreTiles, seen, key, tierOffset))
  }
  return sizes
}

function floodSize(
  oreTiles: Map<string, number>,
  seen: Set<string>,
  start: string,
  tierOffset: number,
): number {
  const stack = [start]
  let size = 0
  while (stack.length > 0) {
    const [tx, ty] = (stack.pop() as string).split(',').map(Number)
    size++
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = `${tx + dx},${ty + dy}`
      if (seen.has(next) || oreTiles.get(next) !== tierOffset) continue
      seen.add(next)
      stack.push(next)
    }
  }
  return size
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const PLANETS = [planetParamsFor(83921, 1), planetParamsFor(83921, 2)]
const ORE = PLANETS.map(planetOreOf)

describe('ore patches (#42)', () => {
  it.each([0, 1])('keeps each band within 5% of its #6 ore density on planet %i + 1', (planet) => {
    const ore = ORE[planet]
    DENSITIES.forEach((density, band) => {
      const fraction = ore.oreByBand[band] / ore.solidByBand[band]
      expect(Math.abs(fraction - density) / density, `band ${band + 1}`).toBeLessThanOrEqual(0.05)
    })
  })

  it.each([0, 1])(
    'makes patches of the band mean size, nearly all within 0.6 to 1.4 times it (planet %i + 1)',
    (planet) => {
      ORE[planet].patchSizesByBand.forEach((sizes, band) => {
        const bandMean = MEANS[band]
        const inRange = sizes.filter((size) => size >= 0.6 * bandMean && size <= 1.4 * bandMean)
        const label = `band ${band + 1}`
        expect(Math.abs(mean(sizes) - bandMean) / bandMean, label).toBeLessThanOrEqual(0.2)
        expect(inRange.length / sizes.length, label).toBeGreaterThanOrEqual(0.9)
      })
    },
  )

  it('makes band-1 patches larger and at least 8 times rarer than tile-by-tile ore', () => {
    const [planet1] = ORE
    const bandOnePatches = planet1.patchSizesByBand[0]
    expect(mean(bandOnePatches)).toBeGreaterThanOrEqual(10)
    expect(bandOnePatches.length).toBeLessThanOrEqual((planet1.solidByBand[0] * 0.1) / 8)
  })

  it('paints the same ore tiles from the same seed and params', () => {
    expect(planetOreOf(planetParamsFor(83921, 1)).oreTiles).toEqual(ORE[0].oreTiles)
  })

  it('grows every patch as one connected piece of plain ground of its band', () => {
    const params = PLANETS[0]
    const box = { x0: -30, y0: 130, x1: 30, y1: 170 }
    const patches = bandPatchesInBox(params, 3, box)
    expect(patches.length).toBeGreaterThan(0)
    for (const patch of patches) {
      expect(patch.tiles.every((tile) => bandOfTile(params, tile.tx, tile.ty) === 3)).toBe(true)
      expect(patchSizesOf(new Map(patch.tiles.map((t) => [`${t.tx},${t.ty}`, 0])))[0]).toEqual([
        patch.tiles.length,
      ])
    }
  })
})

describe('dock guarantee (#42)', () => {
  const SEEDS = Array.from({ length: 20 }, (_, index) => 1000 + 7919 * index)

  it.each(SEEDS)('leaves band-1 ore in the cone under the dock (seed %i)', (seed) => {
    const params = planetParamsFor(seed, 1)
    expect(oreTilesInDockCone(params)).toBeGreaterThan(0)
    expect([0, 1]).toContain(dockGuaranteeCount(params))
  })

  it('stamps a band-1 patch on the cone axis when the band-1 pass left the cone empty', () => {
    const params = { ...planetParamsFor(83921, 1), patchSeedChanceBp: [0, 8870, 8980, 8220, 8800] }
    expect(dockGuaranteeCount(params)).toBe(1)
    expect(oreTilesInDockCone(params)).toBe(12)
  })
})

function cellAt(params: PlanetParams, tx: number, ty: number): number {
  return generateChunk(params, chunkOfTile(tx), chunkOfTile(ty)).cells[cellIndexOfTile(tx, ty)]
}

function oreTilesInDockCone(params: PlanetParams): number {
  const site = dockSiteOf(params)
  let count = 0
  for (let ty = site.padRow - 40; ty < site.padRow; ty++) {
    for (let tx = -20; tx <= 20; tx++) {
      if (
        isInDockCone(params, { tx, ty }) &&
        kindOfCell(cellAt(params, tx, ty)) === CELL_KIND.ore
      ) {
        count++
      }
    }
  }
  return count
}

describe('seeded terrain at one tile', () => {
  it.each([
    [3, 4],
    [-5, 2],
    [0, -9],
  ])('matches the terrain generated for the whole chunk (%i, %i)', (cx, cy) => {
    const params = planetParamsFor(83921, 1)
    const cells = generateBaseTerrain(params, cx, cy)
    cells.forEach((cell, index) => {
      const tx = cx * CHUNK_SIZE + (index % CHUNK_SIZE)
      const ty = cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE)
      expect(baseCellOfTile(params, tx, ty)).toBe(cell)
    })
  })
})
