import { describe, expect, it } from 'vitest'
import { withFreshRegistrySet } from '../registries/seal'
import { dockSiteOf, isDockPadTile } from './dockSite'
import { generateChunk } from './generateChunk'
import { bandOfTile, coreTileCount } from './planetGeometry'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { halfTileDistanceSqToDock, isInStarterZone } from './starterVein'
import {
  CHUNK_SIZE,
  cellIndexOfTile,
  chunkOfTile,
  chunkRangeOfDisc,
  discTileCount,
  halfTileRadiusSq,
} from './tileGrid'
import {
  CELL_KIND,
  RESOURCE_FAMILY,
  familyOfCell,
  isRemovableCell,
  isSolidCell,
  kindOfCell,
  tierOffsetOfCell,
} from './worldCell'

interface GeneratedTile {
  tx: number
  ty: number
  cell: number
}

function cellAt(params: PlanetParams, tx: number, ty: number): number {
  return generateChunk(params, chunkOfTile(tx), chunkOfTile(ty)).cells[cellIndexOfTile(tx, ty)]
}

function everyTileOf(params: PlanetParams): GeneratedTile[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const tiles: GeneratedTile[] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      generateChunk(params, cx, cy).cells.forEach((cell, index) =>
        tiles.push({
          tx: cx * CHUNK_SIZE + (index % CHUNK_SIZE),
          ty: cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE),
          cell,
        }),
      )
    }
  }
  return tiles
}

function tilesOfKind(tiles: GeneratedTile[], kind: number): GeneratedTile[] {
  return tiles.filter(({ cell }) => kindOfCell(cell) === kind)
}

const SEEDS = [1, 83921, 4_000_000_000]
const planet1 = planetParamsFor(83921, 1)
const planet1Tiles = everyTileOf(planet1)

describe('generateChunk determinism', () => {
  it('returns identical cells and density on repeated calls', () => {
    const params = planetParamsFor(7, 2)
    expect(generateChunk(params, -3, 5)).toEqual(generateChunk(params, -3, 5))
  })

  it('gives each chunk the same cells and density whatever order the chunks are generated in', () => {
    const params = planetParamsFor(7, 2)
    const coordinates = [-4, -1, 0, 2, 9].flatMap((cx) => [-9, -1, 0, 3].map((cy) => [cx, cy]))
    const forwards = coordinates.map(([cx, cy]) => generateChunk(params, cx, cy))
    const backwards = [...coordinates].reverse().map(([cx, cy]) => generateChunk(params, cx, cy))
    expect(backwards.reverse()).toEqual(forwards)
  })

  it('makes different planets from different world seeds', () => {
    expect(generateChunk(planetParamsFor(1, 1), 2, 2)).not.toEqual(
      generateChunk(planetParamsFor(2, 1), 2, 2),
    )
  })
})

describe('generated planet shape', () => {
  it('holds exactly the integer-formula number of tiles for R = 300', () => {
    const solidOrAir = planet1Tiles.filter(({ cell }) => kindOfCell(cell) !== CELL_KIND.space)
    expect(solidOrAir).toHaveLength(282_792)
    expect(discTileCount(300)).toBe(282_792)
  })

  it('generates 156 core tiles on planet 1 and 316 on planet 2', () => {
    expect(tilesOfKind(planet1Tiles, CELL_KIND.core)).toHaveLength(coreTileCount(planet1))
    expect(coreTileCount(planet1)).toBe(156)
    const planet2 = planetParamsFor(83921, 2)
    expect(tilesOfKind(everyTileOf(planet2), CELL_KIND.core)).toHaveLength(316)
  })

  it('leaves the pad the only tiles a drill can never remove', () => {
    const site = dockSiteOf(planet1)
    const fixed = planet1Tiles.filter(({ cell }) => isSolidCell(cell) && !isRemovableCell(cell))
    expect(fixed.every(({ tx, ty }) => isDockPadTile(site, tx, ty))).toBe(true)
  })

  it('opens caves in bands 2 to 5 only, so the surface band is whole', () => {
    // The dock clearance is band-1 air too; all of it lies within 10 tiles of the dock point.
    const caves = tilesOfKind(planet1Tiles, CELL_KIND.air).filter(
      ({ tx, ty }) => halfTileDistanceSqToDock(dockSiteOf(planet1), tx, ty) > halfTileRadiusSq(10),
    )
    expect(caves.length).toBeGreaterThan(0)
    expect(caves.every(({ tx, ty }) => bandOfTile(planet1, tx, ty) >= 2)).toBe(true)
  })

  it('stores ore of band b at tier offset b - 1, in the metal or crystal family', () => {
    // The kernel's rule, before a slice's generation hook (#146's rarity lead) folds over it.
    const kernelTiles = withFreshRegistrySet(
      () => {},
      () => everyTileOf(planet1),
    )
    const ore = tilesOfKind(kernelTiles, CELL_KIND.ore)
    expect(
      ore.every(({ tx, ty, cell }) => tierOffsetOfCell(cell) === bandOfTile(planet1, tx, ty) - 1),
    ).toBe(true)
    const families = new Set(ore.map(({ cell }) => familyOfCell(cell)))
    expect(families).toEqual(new Set([RESOURCE_FAMILY.metal, RESOURCE_FAMILY.crystal]))
  })
})

describe('dock site', () => {
  it.each(SEEDS.flatMap((seed) => [1, 2, 3].map((planet) => [seed, planet])))(
    'is a flat, indestructible pad from -8 to +12 with 8 clear tiles above it (seed %i, planet %i)',
    (seed, planet) => {
      expectFlatPad(planetParamsFor(seed, planet), -8, 12)
    },
  )

  it.each(SEEDS)(
    'runs on to column 30 under the counter buildings on planet 40 (seed %i)',
    (seed) => {
      expectFlatPad(planetParamsFor(seed, 40), -8, 30)
    },
  )

  it('sits at the top of the planet, on its surface', () => {
    expect(dockSiteOf(planet1).padRow).toBe(299)
    expect(dockSiteOf(planetParamsFor(1, 2)).padRow).toBe(399)
  })
})

describe('starter vein', () => {
  it.each(SEEDS)(
    'puts lowest-tier ore within 15 tiles of the dock on planet 1 (seed %i)',
    (seed) => {
      const params = planetParamsFor(seed, 1)
      const site = dockSiteOf(params)
      const nearOre = tilesOfKind(everyTileNearDock(params), CELL_KIND.ore).filter(
        ({ tx, ty, cell }) =>
          tierOffsetOfCell(cell) === 0 &&
          halfTileDistanceSqToDock(site, tx, ty) <= halfTileRadiusSq(15),
      )
      expect(nearOre.length).toBeGreaterThan(0)
    },
  )

  it('lies wholly inside band 1, which has no enemy spawn weight (#6, #16)', () => {
    const zone = planet1Tiles.filter(({ tx, ty }) => isInStarterZone(planet1, tx, ty))
    expect(zone.length).toBeGreaterThan(0)
    expect(zone.every(({ tx, ty }) => bandOfTile(planet1, tx, ty) === 1)).toBe(true)
  })

  it('has no starter zone on planet 2', () => {
    const planet2 = planetParamsFor(83921, 2)
    expect(isInStarterZone(planet2, 0, dockSiteOf(planet2).padRow)).toBe(false)
  })
})

function everyTileNearDock(params: PlanetParams): GeneratedTile[] {
  const site = dockSiteOf(params)
  const tiles: GeneratedTile[] = []
  for (let ty = site.padRow - 16; ty <= site.padRow + 16; ty++) {
    for (let tx = -16; tx <= 16; tx++) tiles.push({ tx, ty, cell: cellAt(params, tx, ty) })
  }
  return tiles
}

/** The pad is indestructible from `first` to `last`, cleared 8 tiles above, and stops there. */
function expectFlatPad(params: PlanetParams, first: number, last: number): void {
  const site = dockSiteOf(params)
  for (let tx = first; tx <= last; tx++) {
    expect(kindOfCell(cellAt(params, tx, site.padRow))).toBe(CELL_KIND.indestructible)
    for (let ty = site.padRow + 1; ty <= site.padRow + 8; ty++) {
      expect(isRemovableCell(cellAt(params, tx, ty))).toBe(false)
      expect(kindOfCell(cellAt(params, tx, ty))).not.toBe(CELL_KIND.indestructible)
    }
  }
  expect(kindOfCell(cellAt(params, first - 1, site.padRow))).not.toBe(CELL_KIND.indestructible)
  expect(kindOfCell(cellAt(params, last + 1, site.padRow))).not.toBe(CELL_KIND.indestructible)
}
