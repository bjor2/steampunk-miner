/**
 * Ticket 298's perf line (TD and Performance Tester): a chunk rebuild on a gated planet with the
 * `cellGateLook` provider registered and with none, each held to #154's 2 ms presentation line
 * (#36: one chunk rebuild per frame plus its halo). The cells and halo are made once under the
 * loaded slices; only `buildChunkTileBatch` is timed, alternating the loaded set (mining-gates
 * registered) with an empty one (no provider, the terrain as before the channel), so load drift
 * lands on both alike. Measured and printed, not gated in CI.
 */
import type { BenchmarkSeries } from '../../src/logging/benchmarkResult'
import { withRegistrations } from '../../src/registries/registrar'
import { buildChunkTileBatch } from '../../src/systems/render/chunkTileBatch'
import { chunkDensityHaloOf } from '../../src/systems/render/densityHalo'
import { planetParamsFor, type PlanetParams } from '../../src/systems/world/planetParams'
import { chunkRangeOfDisc } from '../../src/systems/world/tileGrid'
import {
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
} from '../../src/systems/world/worldState'

const BUDGET_P95_MS = 2
/** Fire and Frost: gate content starts on planet 7 (GD lock on #148). */
const GATED_PLANETS = [8, 17]

interface ChunkInput {
  cx: number
  cy: number
  cells: Uint32Array
  halo: Uint8Array
}

interface RebuildTimes {
  withGates: number[]
  withoutGates: number[]
}

/** Both series per gated planet: `buildChunkTileBatch.gates` and `buildChunkTileBatch.noGates`. */
export function benchGateChannelRebuild(worldSeed: number): BenchmarkSeries[] {
  return GATED_PLANETS.flatMap((planetIndex) =>
    benchPlanet(planetParamsFor(worldSeed, planetIndex)),
  )
}

function benchPlanet(params: PlanetParams): BenchmarkSeries[] {
  const chunks = chunkInputsOf(params)
  timeRebuilds(params, chunks)
  const times = timeRebuilds(params, chunks)
  printLine(params.planetIndex, 'registered', times.withGates)
  printLine(params.planetIndex, 'none', times.withoutGates)
  return [
    { name: 'buildChunkTileBatch.gates', planet: params.planetIndex, timesMs: times.withGates },
    {
      name: 'buildChunkTileBatch.noGates',
      planet: params.planetIndex,
      timesMs: times.withoutGates,
    },
  ]
}

function chunkInputsOf(params: PlanetParams): ChunkInput[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const chunks: ChunkInput[] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) chunks.push(chunkInputOf(params, cx, cy))
  }
  return chunks
}

function chunkInputOf(params: PlanetParams, cx: number, cy: number): ChunkInput {
  const densityOf = (x: number, y: number) => currentDensityOfChunk(EMPTY_WORLD, params, x, y)
  return {
    cx,
    cy,
    cells: materialCellsOfChunk(EMPTY_WORLD, params, cx, cy),
    halo: chunkDensityHaloOf(densityOf, cx, cy),
  }
}

function timeRebuilds(params: PlanetParams, chunks: readonly ChunkInput[]): RebuildTimes {
  const times: RebuildTimes = { withGates: [], withoutGates: [] }
  for (const chunk of chunks) {
    times.withGates.push(timeOneRebuildMs(params, chunk))
    times.withoutGates.push(withRegistrations([], () => timeOneRebuildMs(params, chunk)))
  }
  return times
}

function timeOneRebuildMs(params: PlanetParams, { cx, cy, cells, halo }: ChunkInput): number {
  const start = performance.now()
  buildChunkTileBatch(params, cx, cy, cells, halo)
  return performance.now() - start
}

function printLine(planetIndex: number, gateLook: string, times: readonly number[]): void {
  const p95Ms = percentile(times, 0.95)
  console.log(
    JSON.stringify({
      bench: 'buildChunkTileBatch',
      planetIndex,
      gateLook,
      chunks: times.length,
      p50Ms: Number(percentile(times, 0.5).toFixed(3)),
      p95Ms: Number(p95Ms.toFixed(3)),
      budgetP95Ms: BUDGET_P95_MS,
      isWithinBudget: p95Ms < BUDGET_P95_MS,
    }),
  )
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}
