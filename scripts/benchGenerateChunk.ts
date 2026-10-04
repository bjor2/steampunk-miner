/**
 * Decision #4 acceptance 8: `generateChunk` must stay under 2 ms at the 95th percentile on the
 * reference machine. Measured and logged here, not gated in CI, because CI machines vary.
 * Run with `npm run bench:world`; it prints one JSON line per planet.
 */
import { generateChunk } from '../src/systems/world/generateChunk'
import { planetParamsFor, type PlanetParams } from '../src/systems/world/planetParams'
import { chunkRangeOfDisc } from '../src/systems/world/tileGrid'

const BUDGET_P95_MS = 2
const WORLD_SEED = 83921
const PLANETS = [1, 2]

function chunkTimesMs(params: PlanetParams): number[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const times: number[] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) times.push(timeOneChunkMs(params, cx, cy))
  }
  return times
}

function timeOneChunkMs(params: PlanetParams, cx: number, cy: number): number {
  const start = performance.now()
  generateChunk(params, cx, cy)
  return performance.now() - start
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function benchPlanet(planetIndex: number): void {
  const params = planetParamsFor(WORLD_SEED, planetIndex)
  chunkTimesMs(params)
  const times = chunkTimesMs(params)
  const p95Ms = percentile(times, 0.95)
  console.log(
    JSON.stringify({
      bench: 'generateChunk',
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
