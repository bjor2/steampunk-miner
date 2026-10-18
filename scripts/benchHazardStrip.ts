/**
 * The hazard strip sampler's main-thread cost a frame (TD scope g on #316, ticket 341 acceptance:
 * at most 0.5 ms p95 a frame at 20, 100, 1,000 and 10,000 m/s). Measured and logged here, not
 * gated: p95 is judged on the reference machine. Run with `npm run bench:strip` (`-- --log` writes
 * `benchmark_result` lines, #124).
 *
 * Two digs at 60 frames a second, each speed from a cold start:
 * - the spec fixture's plain line (`stripFixtures.ts`), lava every 50 m, long enough for every speed;
 * - planet 30's own ground, seed and patches and caves and all, straight down from the surface, for
 *   3 s or until the core, whichever comes first.
 * The cost model's own estimate (`spentUs`) is printed beside the clock, so a drift between the two
 * says which unit cost to re-measure in `constants/hazardStrip.ts`.
 */
import { loadFeatures } from '../src/features'
import { STRIP_FRAME_BUDGET_MS } from '../src/constants/hazardStrip'
import {
  createHazardStrip,
  sampleHazardStrip,
  type StripFrame,
} from '../src/systems/render/hazardStrip/hazardStripSampler'
import { createSeededStripGround } from '../src/systems/render/hazardStrip/seededStripGround'
import {
  createFixtureGround,
  digFrameAt,
  lavaAt,
  VIEWER_WITH_SCANNER,
} from '../src/systems/render/hazardStrip/stripFixtures'
import type { StripGround } from '../src/systems/render/hazardStrip/stripGround'
import { freshPlanetParamsFor } from '../src/systems/world/planetParams'
import { EMPTY_WORLD } from '../src/systems/world/worldState'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'
import { devFlagSetLine } from '../src/logging/devFlagReport'

loadFeatures()

const SPEEDS = [20, 100, 1000, 10_000]
const FRAME_SECONDS = 1 / 60
const DIG_SECONDS = 3
const PLANET = 30
const SEED = 1

interface FrameTimes {
  timesMs: number[]
  modelUs: number[]
}

function timeDig(ground: StripGround, frameAt: (seconds: number) => StripFrame | null) {
  const strip = createHazardStrip()
  const run: FrameTimes = { timesMs: [], modelUs: [] }
  for (let seconds = 0; seconds <= DIG_SECONDS; seconds += FRAME_SECONDS) {
    const frame = frameAt(seconds)
    if (frame === null) break
    const started = performance.now()
    sampleHazardStrip(strip, ground, frame)
    run.timesMs.push(performance.now() - started)
    run.modelUs.push(strip.spentUs)
  }
  return run
}

function fixtureDig(speed: number): FrameTimes {
  const lava = Array.from({ length: 2000 }, (_, at) => lavaAt(50 * (at + 1)))
  return timeDig(createFixtureGround(lava), (seconds) =>
    digFrameAt(seconds, speed, VIEWER_WITH_SCANNER),
  )
}

/** Straight down planet 30 from its surface, stopping short of the core. */
function planetDig(speed: number): FrameTimes {
  const params = freshPlanetParamsFor(SEED, PLANET)
  const ground = createSeededStripGround(params, EMPTY_WORLD)
  const top = params.radiusTiles - 0.5
  return timeDig(ground, (seconds) => {
    const y = top - speed * seconds
    if (y < params.coreRadiusTiles) return null
    return { ...digFrameAt(seconds, speed, VIEWER_WITH_SCANNER), nose: { x: 0.5, y } }
  })
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const round = (value: number) => Number(value.toFixed(3))

function reportOf(speed: number, run: FrameTimes) {
  return {
    speed,
    frames: run.timesMs.length,
    p50Ms: round(percentile(run.timesMs, 0.5)),
    p95Ms: round(percentile(run.timesMs, 0.95)),
    maxMs: round(Math.max(...run.timesMs)),
    modelP95Us: round(percentile(run.modelUs, 0.95)),
  }
}

const fixture = SPEEDS.map((speed) => ({ speed, run: fixtureDig(speed) }))
const planet = SPEEDS.map((speed) => ({ speed, run: planetDig(speed) }))
console.log(
  JSON.stringify({
    bench: 'hazardStrip',
    budgetMs: STRIP_FRAME_BUDGET_MS,
    fixture: fixture.map(({ speed, run }) => reportOf(speed, run)),
    planet30: planet.map(({ speed, run }) => reportOf(speed, run)),
  }),
)
logBenchmarkSeriesWhenAsked('strip', [
  ...fixture.map(({ speed, run }) => ({
    name: `hazardStrip.fixture.${speed}`,
    // The fixture is no planet; its line is logged under planet 1, as the other benches' are.
    planet: 1,
    timesMs: run.timesMs,
  })),
  ...planet.map(({ speed, run }) => ({
    name: `hazardStrip.p${PLANET}.${speed}`,
    planet: PLANET,
    timesMs: run.timesMs,
  })),
])

// The flag set the bench ran with (ticket 547): every bench report prints it.
console.log(devFlagSetLine([]))
