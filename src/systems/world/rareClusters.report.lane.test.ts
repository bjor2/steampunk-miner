import { beforeAll, describe, expect, it } from 'vitest'
import { clusterKindsOfHooks } from '../registries/generationHooks'
import { freshPlanetParamsFor } from './planetParams'
import { DEEP_RARE_FIRST_BAND, RARE_CLUSTER_SIZE_SHARES_PERCENT } from './planetTable'
import {
  deepClustersOf,
  grownClustersOf,
  rareClusterCensusOf,
  rareKindSlotsOf,
  sizeSharesPercentOf,
  type RareCluster,
  type RareClusterCensus,
} from './rareClusterCensus'
import { tileKeyOf } from './rareClusters'
import type { TilePoint } from './tileGrid'

// Ticket 737's 5-seed report (done-when 4; HS 2 and VS 1 on #737): fresh planets 1 to 5, entered
// under ore rules 10, on five seeds. Zero clusters over 3 cells; every cluster the step grows is
// painted as one connected run of exactly its cells; the sizes of the clusters at d >= 0.35, pooled
// over the 25 planets, within 5 points of 50/35/15; every rare kind held on every planet; no cluster
// at d < 0.35 grown past its seed; and the same seed generating the same bytes. The commons and the
// #448 density stay as rules 9 painted them (`rareClusters.test.ts`). A lane: about a minute and a
// half, run when named.

const LANE_TIMEOUT_MS = 900_000
const REPORT_SEEDS = [83921, 31415, 27182, 4_000_000_000, 1]
const PLANETS = [1, 2, 3, 4, 5]
const SHARE_TOLERANCE_POINTS = 5

interface PlanetReport {
  planet: number
  seed: number
  census: RareClusterCensus
  grown: (readonly TilePoint[])[]
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
    grown: grownClustersOf(params),
    missingKindSlots: kinds.filter((slot) => !held.has(slot)),
  }
}

function keysOf(tiles: readonly TilePoint[]): string[] {
  return tiles.map(tileKeyOf).sort()
}

/** The grown clusters no painted cluster matches cell for cell. */
function unpaintedClustersOf(report: PlanetReport): string[][] {
  const painted = new Set(report.census.clusters.map((cluster) => keysOf(cluster.tiles).join(' ')))
  return report.grown.map(keysOf).filter((keys) => !painted.has(keys.join(' ')))
}

function printReport(reports: readonly PlanetReport[], deep: readonly RareCluster[]): void {
  const rows = reports.map(
    (report) =>
      `P${report.planet} seed ${report.seed}: ${report.census.clusters.length} clusters, ` +
      `deep ${sizeSharesPercentOf(deepClustersOf(report.census)).join('/')} %`,
  )
  console.log(
    [
      ...rows,
      `pooled d >= 0.35: ${deep.length} clusters, ${sizeSharesPercentOf(deep).join('/')} %`,
    ].join('\n'),
  )
}

describe('rare-ore cluster report, planets 1 to 5 on five seeds', () => {
  const reports: PlanetReport[] = []

  beforeAll(() => {
    for (const planet of PLANETS) {
      reports.push(...REPORT_SEEDS.map((seed) => reportOf(planet, seed)))
    }
  }, LANE_TIMEOUT_MS)

  it('paints no cluster over 3 cells', () => {
    const large = reports.flatMap((report) =>
      report.census.clusters.filter((cluster) => cluster.tiles.length > 3),
    )
    expect(large).toEqual([])
  })

  it('paints every cluster it grows as one connected run of exactly its cells', () => {
    for (const report of reports) {
      expect(unpaintedClustersOf(report), `P${report.planet} seed ${report.seed}`).toEqual([])
      expect(report.census.clusters.length).toBe(report.grown.length)
    }
  })

  it('sizes the clusters at d >= 0.35 within 5 points of 50/35/15', () => {
    const deep = reports.flatMap((report) => deepClustersOf(report.census))
    printReport(reports, deep)
    const shares = sizeSharesPercentOf(deep)
    RARE_CLUSTER_SIZE_SHARES_PERCENT.forEach((target, at) => {
      expect(Math.abs(shares[at] - target), `size ${at + 1}`).toBeLessThanOrEqual(
        SHARE_TOLERANCE_POINTS,
      )
    })
    expect(shares[3]).toBe(0)
  })

  it('grows no cluster past its seed at d < 0.35', () => {
    const shallow = reports.flatMap((report) =>
      report.census.clusters.filter((cluster) => cluster.band < DEEP_RARE_FIRST_BAND),
    )
    expect(shallow.filter((cluster) => cluster.tiles.length > 1)).toEqual([])
  })

  it('holds a cluster of every rare kind on every planet and seed', () => {
    for (const report of reports) {
      expect(report.missingKindSlots, `P${report.planet} seed ${report.seed}`).toEqual([])
    }
  })

  it(
    'generates the same bytes from the same seed',
    () => {
      for (const planet of PLANETS) {
        const again = rareClusterCensusOf(freshPlanetParamsFor(REPORT_SEEDS[0], planet))
        const first = reports.find((report) => report.planet === planet) as PlanetReport
        expect(again.digest, `P${planet}`).toBe(first.census.digest)
      }
    },
    LANE_TIMEOUT_MS,
  )
})
