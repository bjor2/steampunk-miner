/**
 * Decision #4 / #22 acceptance: terrain updates stay under 2 ms per frame. The scene rebuilds at
 * most one chunk mesh per frame, so one `buildChunkTileBatch` (cells already generated) must fit
 * the budget. Measured and logged here, not gated in CI, because CI machines vary.
 * Run with `npm run bench:render`; it prints one JSON line per planet.
 */
import { buildChunkTileBatch } from '../src/systems/render/chunkTileBatch'
import { planetParamsFor, type PlanetParams } from '../src/systems/world/planetParams'
import { chunkRangeOfDisc } from '../src/systems/world/tileGrid'
import { cellAt, currentCellsOfChunk, EMPTY_WORLD } from '../src/systems/world/worldState'

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
  const cells = currentCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  const cellOutside = (tx: number, ty: number) => cellAt(EMPTY_WORLD, params, { tx, ty })
  const start = performance.now()
  buildChunkTileBatch(params, cx, cy, cells, cellOutside)
  return performance.now() - start
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function benchPlanet(planetIndex: number): void {
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
}

PLANETS.forEach(benchPlanet)
