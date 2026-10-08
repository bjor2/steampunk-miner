/**
 * Decision #4 / #22 acceptance: terrain updates stay under 2 ms per frame. The scene rebuilds at
 * most one chunk mesh per frame, so one density halo plus `buildChunkTileBatch` (chunks already
 * generated) must fit the budget. Measured and logged here, not gated in CI, because CI machines vary.
 * Run with `npm run bench:render`; it prints one JSON line per planet, then the rebuild on gated
 * planets with the gate channel's provider registered and with none (ticket 298,
 * `bench/gateChannelRebuild.ts`), then the overlay's frame cost (#208, `bench/overlayFrame.ts`),
 * then the magnetic field lines' frame cost before and after their layer on P43 (#293,
 * `bench/fieldArcsFrame.ts`).
 * With `-- --log` it also writes `benchmark_result` lines to `logs/<runId>/events.ndjson` (#124).
 */
import { loadFeatures } from '../src/features'
import type { BenchmarkSeries } from '../src/logging/benchmarkResult'
import { buildChunkTileBatch } from '../src/systems/render/chunkTileBatch'
import { chunkDensityHaloOf } from '../src/systems/render/densityHalo'
import { planetParamsFor, type PlanetParams } from '../src/systems/world/planetParams'
import { chunkRangeOfDisc } from '../src/systems/world/tileGrid'
import {
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
} from '../src/systems/world/worldState'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'
import { benchFieldArcsFrame } from './bench/fieldArcsFrame'
import { benchGateChannelRebuild } from './bench/gateChannelRebuild'
import { benchOverlayFrame } from './bench/overlayFrame'

loadFeatures()

const BUDGET_P95_MS = 2
const WORLD_SEED = 83921
const PLANETS = [1, 2]

function batchTimesMs(params: PlanetParams): number[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const times: number[] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) times.push(timeOneBatchMs(params, cx, cy))
  }
  return times
}

function timeOneBatchMs(params: PlanetParams, cx: number, cy: number): number {
  const cells = materialCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  const densityOf = (x: number, y: number) => currentDensityOfChunk(EMPTY_WORLD, params, x, y)
  for (const [x, y] of [
    [cx, cy],
    [cx + 1, cy],
    [cx, cy + 1],
    [cx + 1, cy + 1],
  ])
    densityOf(x, y)
  const start = performance.now()
  buildChunkTileBatch(params, cx, cy, cells, chunkDensityHaloOf(densityOf, cx, cy))
  return performance.now() - start
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function benchPlanet(planetIndex: number): BenchmarkSeries {
  const params = planetParamsFor(WORLD_SEED, planetIndex)
  batchTimesMs(params)
  const times = batchTimesMs(params)
  const p95Ms = percentile(times, 0.95)
  console.log(
    JSON.stringify({
      bench: 'buildChunkTileBatch',
      planetIndex,
      chunks: times.length,
      p50Ms: Number(percentile(times, 0.5).toFixed(3)),
      p95Ms: Number(p95Ms.toFixed(3)),
      budgetP95Ms: BUDGET_P95_MS,
      isWithinBudget: p95Ms < BUDGET_P95_MS,
    }),
  )
  return { name: 'buildChunkTileBatch', planet: planetIndex, timesMs: times }
}

logBenchmarkSeriesWhenAsked('render', [
  ...PLANETS.map(benchPlanet),
  ...benchGateChannelRebuild(WORLD_SEED),
  benchOverlayFrame(),
  ...benchFieldArcsFrame(WORLD_SEED),
])
