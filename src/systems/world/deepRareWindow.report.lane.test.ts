import { beforeAll, describe, expect, it } from 'vitest'
import { clusterKindsOfHooks } from '../registries/generationHooks'
import { generateChunkCells } from './generateChunk'
import { freshPlanetParamsFor, type PlanetParams } from './planetParams'
import { BAND_COUNT, bandOfTile } from './planetGeometry'
import { DEEP_RARE_FIRST_BAND } from './planetTable'
import { rareClusterCensusOf, rareKindSlotsOf, type RareClusterCensus } from './rareClusterCensus'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
  halfTileDistanceSq,
} from './tileGrid'
import { CELL_KIND, kindOfCell, kindSlotOfCell, NO_KIND_SLOT, tierOffsetOfCell } from './worldCell'

// Ticket 738's 5-seed report (done-when 1 and 2; Bjor's deep-rares rule, GD lock on #737): fresh
// planets 3 to 7, entered under ore rules 11, on five seeds. Zero rare, epic or mythic cells at
// d < 0.35 (bands 1 and 2), guaranteed clusters included; band 1 keeps a non-common kind; every
// rare kind the roster names is held at d >= 0.35. It prints each planet's rare, epic and mythic
// cells per band. The money checks (the named #644 re-baseline "deep rares": per-run income, R3 and
// the 22-30 min pace) are the Tester's balance runs. A lane: about three minutes, run when named.

const LANE_TIMEOUT_MS = 900_000
const REPORT_SEEDS = [83921, 31415, 27182, 4_000_000_000, 1]
const PLANETS = [3, 4, 5, 6, 7]

interface PlanetReport {
  planet: number
  seed: number
  census: RareClusterCensus
  /** Rare, epic and mythic cells per band, bands 1 to 5. */
  rareCellsByBand: number[]
  /** The kind slots of band 1's uncommon cells. */
  bandOneNonCommonKinds: Set<number>
  missingKindSlots: number[]
}

function reportOf(planet: number, seed: number): PlanetReport {
  const params = freshPlanetParamsFor(seed, planet)
  const census = rareClusterCensusOf(params)
  const held = rareKindSlotsOf(census)
  const kinds = clusterKindsOfHooks(params).map((kind) => kind.kindSlot)
  return {
    planet,
    seed,
    census,
    rareCellsByBand: rareCellsByBandOf(census),
    bandOneNonCommonKinds: bandOneNonCommonKindsOf(params),
    missingKindSlots: kinds.filter((slot) => !held.has(slot)),
  }
}

function rareCellsByBandOf(census: RareClusterCensus): number[] {
  const cells = Array.from({ length: BAND_COUNT }, () => 0)
  for (const cluster of census.clusters) cells[cluster.band - 1] += cluster.tiles.length
  return cells
}

/** Every kinded ore cell of band 1 above common, read from the chunks the band crosses. */
function bandOneNonCommonKindsOf(params: PlanetParams): Set<number> {
  const kinds = new Set<number>()
  for (const [cx, cy] of bandOneChunksOf(params)) {
    const cells = generateChunkCells(params, cx, cy)
    for (let at = 0; at < CHUNK_CELLS; at++) {
      const tx = firstTileOfChunk(cx) + (at % CHUNK_SIZE)
      const ty = firstTileOfChunk(cy) + Math.floor(at / CHUNK_SIZE)
      if (bandOfTile(params, tx, ty) === 1 && isKindedNonCommon(cells[at]))
        kinds.add(kindSlotOfCell(cells[at]))
    }
  }
  return kinds
}

/** A band-1 ore cell above common: its tier offset is its lead there. */
function isKindedNonCommon(cell: number): boolean {
  const isOre = kindOfCell(cell) === CELL_KIND.ore
  return isOre && tierOffsetOfCell(cell) >= 1 && kindSlotOfCell(cell) !== NO_KIND_SLOT
}

/** The chunks some of whose tiles lie outside band 2's inner edge, so possibly in band 1. */
function bandOneChunksOf(params: PlanetParams): [number, number][] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const span = Array.from({ length: max - min + 1 }, (_, at) => min + at)
  return span
    .flatMap((cy) => span.map((cx): [number, number] => [cx, cy]))
    .filter(([cx, cy]) => farthestCornerSqOf(cx, cy) > params.bandStartsHalfTileSq[0])
}

function farthestCornerSqOf(cx: number, cy: number): number {
  const xs = [firstTileOfChunk(cx), firstTileOfChunk(cx) + CHUNK_SIZE - 1]
  const ys = [firstTileOfChunk(cy), firstTileOfChunk(cy) + CHUNK_SIZE - 1]
  return Math.max(...xs.flatMap((tx) => ys.map((ty) => halfTileDistanceSq(tx, ty))))
}

function printReport(reports: readonly PlanetReport[]): void {
  const rows = reports.map(
    (report) =>
      `P${report.planet} seed ${report.seed}: rare+ cells by band ` +
      `${report.rareCellsByBand.join(' / ')}, band 1 non-common kinds ` +
      `${report.bandOneNonCommonKinds.size}`,
  )
  console.log(rows.join('\n'))
}

describe('deep rare window report, planets 3 to 7 on five seeds (ticket 738)', () => {
  const reports: PlanetReport[] = []

  beforeAll(() => {
    for (const planet of PLANETS) {
      reports.push(...REPORT_SEEDS.map((seed) => reportOf(planet, seed)))
    }
    printReport(reports)
  }, LANE_TIMEOUT_MS)

  it('paints no rare, epic or mythic cell at d < 0.35, guaranteed clusters included', () => {
    const shallow = reports.flatMap((report) =>
      report.census.clusters
        .filter((cluster) => cluster.band < DEEP_RARE_FIRST_BAND)
        .map((cluster) => `P${report.planet} seed ${report.seed} band ${cluster.band}`),
    )
    expect(shallow).toEqual([])
  })

  it('paints rare, epic or mythic cells in bands 3 to 5 of every planet and seed', () => {
    for (const report of reports) {
      const deep = report.rareCellsByBand.slice(DEEP_RARE_FIRST_BAND - 1)
      expect(
        deep.reduce((sum, cells) => sum + cells, 0),
        `P${report.planet} seed ${report.seed}`,
      ).toBeGreaterThan(0)
    }
  })

  it('keeps a non-common kind in band 1 of every planet and seed', () => {
    for (const report of reports) {
      expect(
        report.bandOneNonCommonKinds.size,
        `P${report.planet} seed ${report.seed}`,
      ).toBeGreaterThan(0)
    }
  })

  it('holds a cluster of every rare kind on every planet and seed', () => {
    for (const report of reports) {
      expect(report.missingKindSlots, `P${report.planet} seed ${report.seed}`).toEqual([])
    }
  })
})
