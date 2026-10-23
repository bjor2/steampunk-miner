import { beforeAll, describe, expect, it } from 'vitest'
import { clusterKindsOfHooks } from '../registries/generationHooks'
import { chunkDigest } from './chunkDigest'
import { generateChunk } from './generateChunk'
import { guaranteedClusterTiles } from './guaranteedClusters'
import { bandPatchesInBox } from './orePatches'
import { patchCellOf } from './patchCell'
import {
  freshPlanetParamsFor,
  oreRulesVersionOnEntry,
  P2_OWN_KINDS_ORE_RULES,
  planetParamsFor,
  RARE_CLUSTER_ORE_RULES,
  type PlanetParams,
} from './planetParams'
import { BAND_COUNT, bandOfTile } from './planetGeometry'
import { DEEP_RARE_FIRST_BAND } from './planetTable'
import { rareClusterCensusOf, rareKindSlotsOf, type RareClusterCensus } from './rareClusterCensus'
import { clusterSizeAt, isRareOreCell, oreTilesOfPatch } from './rareClusters'
import {
  CHUNK_SIZE,
  cellIndexOfTile,
  chunkOfTile,
  chunkRangeOfDisc,
  firstTileOfChunk,
  type TilePoint,
} from './tileGrid'
import { CELL_KIND, kindOfCell, kindSlotOfCell } from './worldCell'

// Ticket 737 (Bjor's deep-rares rule, GD lock 22 Oct): under ore rules 10 a rare, epic or mythic
// patch paints a seeded cluster of 1 to 3 orthogonally connected cells, never at d < 0.35 beyond
// its seed, and every rare kind holds one guaranteed cluster. A whole planet 1 takes about a second.

const PLANET_TIMEOUT_MS = 60_000
const SEED = 83921
const CHUNKS_OF_PLANET_3 = [
  [0, -5],
  [3, 4],
  [-6, 1],
  [5, -2],
  [-2, -7],
  [7, 6],
] as const

function chunkDigestsOf(params: PlanetParams, chunks: readonly (readonly [number, number])[]) {
  return chunks.map(([cx, cy]) => chunkDigest(generateChunk(params, cx, cy)))
}

function cellAt(params: PlanetParams, tile: TilePoint): number {
  return generateChunk(params, chunkOfTile(tile.tx), chunkOfTile(tile.ty)).cells[
    cellIndexOfTile(tile.tx, tile.ty)
  ]
}

function steps(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty)
}

/** Every tile of the chunks where the two rules paint different cells. */
function changedTilesOf(
  before: PlanetParams,
  after: PlanetParams,
  chunks: readonly (readonly [number, number])[],
) {
  const changed: { band: number; before: number; after: number }[] = []
  for (const [cx, cy] of chunks) {
    const old = generateChunk(before, cx, cy).cells
    const now = generateChunk(after, cx, cy).cells
    for (let index = 0; index < old.length; index++) {
      if (old[index] === now[index]) continue
      const tx = firstTileOfChunk(cx) + (index % CHUNK_SIZE)
      const ty = firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE)
      changed.push({ band: bandOfTile(after, tx, ty), before: old[index], after: now[index] })
    }
  }
  return changed
}

describe('rare-ore clusters', () => {
  let planet1: RareClusterCensus

  beforeAll(() => {
    planet1 = rareClusterCensusOf(freshPlanetParamsFor(SEED, 1))
  }, PLANET_TIMEOUT_MS)

  it('stamps every planet entered from this build with the cluster rules or later, planet 1 included', () => {
    for (const planet of [1, 2, 3, 8, 60]) {
      expect(oreRulesVersionOnEntry(planet), `planet ${planet}`).toBeGreaterThanOrEqual(
        RARE_CLUSTER_ORE_RULES,
      )
    }
  })

  it('draws cluster sizes 1, 2 and 3 at 50, 35 and 15 percent from the seed cell', () => {
    const params = freshPlanetParamsFor(SEED, 3)
    const counts = [0, 0, 0]
    for (let tx = -100; tx < 100; tx++) {
      for (let ty = -100; ty < 100; ty++) counts[clusterSizeAt(params, { tx, ty }) - 1]++
    }
    const shares = counts.map((count) => count / 40_000)
    expect(shares[0]).toBeCloseTo(0.5, 1)
    expect(shares[1]).toBeCloseTo(0.35, 1)
    expect(shares[2]).toBeCloseTo(0.15, 1)
  })

  it('takes the same size for the same planet seed and seed cell, and another for another planet seed', () => {
    const tiles = Array.from({ length: 200 }, (_, at) => ({ tx: at, ty: -at }))
    const sizesOf = (params: PlanetParams) => tiles.map((tile) => clusterSizeAt(params, tile))
    expect(sizesOf(freshPlanetParamsFor(SEED, 3))).toEqual(sizesOf(freshPlanetParamsFor(SEED, 3)))
    expect(sizesOf(freshPlanetParamsFor(SEED, 3))).not.toEqual(sizesOf(freshPlanetParamsFor(1, 3)))
  })

  it('paints a whole planet with no rare cluster over 3 cells', () => {
    expect(planet1.clusters.length).toBeGreaterThan(0)
    expect(planet1.clusters.filter((cluster) => cluster.tiles.length > 3)).toEqual([])
  })

  it('paints each rare patch cluster as one connected run of its own cells, seed first', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    const r = params.radiusTiles
    const box = { x0: -r, y0: -r, x1: r, y1: r }
    for (let band = DEEP_RARE_FIRST_BAND; band <= BAND_COUNT; band++) {
      for (const patch of bandPatchesInBox(params, band, box)) {
        const cell = patchCellOf(params, patch)
        if (!isRareOreCell(band, cell)) continue
        const tiles = oreTilesOfPatch(params, patch, cell)
        expect(tiles.length).toBeLessThanOrEqual(3)
        if (tiles.length > 0) expect(tiles[0]).toEqual(patch.centre)
        tiles.forEach((tile, at) => {
          expect(cellAt(params, tile)).toBe(cell)
          if (at > 0)
            expect(tiles.slice(0, at).some((other) => steps(other, tile) === 1)).toBe(true)
        })
      }
    }
  })

  it('grows no cluster past its seed at d < 0.35, so every shallow cluster is one cell', () => {
    const shallow = planet1.clusters.filter((cluster) => cluster.band < DEEP_RARE_FIRST_BAND)
    expect(shallow.filter((cluster) => cluster.tiles.length > 1)).toEqual([])
    // Rules 10's P3 still rolls rare in band 2; the deep window of rules 11 (ticket 738) does not.
    const planet3 = planetParamsFor(SEED, 3, RARE_CLUSTER_ORE_RULES)
    const r = planet3.radiusTiles
    const band2 = bandPatchesInBox(planet3, 2, { x0: -r, y0: -r, x1: r, y1: r })
    const rare = band2.filter((patch) => isRareOreCell(2, patchCellOf(planet3, patch)))
    expect(rare.length).toBeGreaterThan(0)
    for (const patch of rare) {
      expect(oreTilesOfPatch(planet3, patch, patchCellOf(planet3, patch)).length).toBeLessThan(2)
    }
  })

  it('holds one guaranteed cluster of each rare kind, at d >= 0.35, on planets 1 to 3', () => {
    for (const planet of [1, 2, 3]) {
      const params = freshPlanetParamsFor(SEED, planet)
      const kinds = clusterKindsOfHooks(params)
      const guaranteed = guaranteedClusterTiles(params)
      expect(kinds.length, `planet ${planet}`).toBeGreaterThan(0)
      expect(new Set(guaranteed.map((tile) => kindSlotOfCell(tile.cell))).size).toBe(kinds.length)
      for (const tile of guaranteed) {
        expect(bandOfTile(params, tile.tx, tile.ty)).toBeGreaterThanOrEqual(DEEP_RARE_FIRST_BAND)
        expect(cellAt(params, tile)).toBe(tile.cell)
      }
    }
    const held = rareKindSlotsOf(planet1)
    const kinds = clusterKindsOfHooks(freshPlanetParamsFor(SEED, 1))
    expect(kinds.filter((kind) => !held.has(kind.kindSlot))).toEqual([])
  })

  it(
    'keeps every common and uncommon cell rules 9 painted, and fills a rare patch tile with ground or a later patch',
    () => {
      for (const planet of [2, 3]) {
        const before = planetParamsFor(SEED, planet, P2_OWN_KINDS_ORE_RULES)
        const after = planetParamsFor(SEED, planet, RARE_CLUSTER_ORE_RULES)
        const r = after.radiusTiles
        const { min, max } = chunkRangeOfDisc(r)
        const chunks: [number, number][] = []
        for (let cy = min; cy <= max; cy += 2)
          for (let cx = min; cx <= max; cx += 2) chunks.push([cx, cy])
        for (const change of changedTilesOf(before, after, chunks)) {
          const isRareBefore = isRareOreCell(change.band, change.before)
          const isRareAfter = isRareOreCell(change.band, change.after)
          const isGroundBefore = kindOfCell(change.before) === CELL_KIND.ground
          expect(isRareBefore || (isGroundBefore && isRareAfter), `planet ${planet}`).toBe(true)
        }
      }
    },
    PLANET_TIMEOUT_MS,
  )

  it('paints the same chunks whatever order a fresh planet makes them in', () => {
    const inOrder = chunkDigestsOf(freshPlanetParamsFor(SEED, 3), CHUNKS_OF_PLANET_3)
    const reversed = [...CHUNKS_OF_PLANET_3].reverse()
    const backwards = chunkDigestsOf(freshPlanetParamsFor(SEED, 3), reversed).reverse()
    expect(backwards).toEqual(inOrder)
  })

  it('leaves a planet a save holds under rules 9 with its whole rare patches', () => {
    const params = planetParamsFor(SEED, 1, P2_OWN_KINDS_ORE_RULES)
    expect(guaranteedClusterTiles(params)).toEqual([])
    const r = params.radiusTiles
    const box = { x0: -r, y0: -r, x1: r, y1: r }
    const rare = [3, 4, 5].flatMap((band) =>
      bandPatchesInBox(params, band, box).filter((patch) =>
        isRareOreCell(band, patchCellOf(params, patch)),
      ),
    )
    expect(rare.length).toBeGreaterThan(0)
    for (const patch of rare) {
      expect(oreTilesOfPatch(params, patch, patchCellOf(params, patch))).toBe(patch.tiles)
    }
  })
})
