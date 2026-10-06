/**
 * Frame cost against depth and planet, per session (#125, logging strategy section 6 step 3): the
 * `perf_sample` seconds (#38, #121) grouped by the planet and the depth band the vehicle was in
 * (the envelope's `planet` and `depthTiles`), with the median p95 frame, the worst p99 frame, the
 * long tasks and the seconds over the #38 frame budget.
 */
import { FRAME_BUDGET_MS } from '../../constants/scene'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { planetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import { surfaceRowOfColumn } from '../../systems/world/tileGrid'
import type { RunEvent } from '../runEvent'
import { eventsNamed, type SessionLog } from './sessionTable'
import { medianOf } from './trendMaths'

/**
 * Band starts depend on the planet's radius alone (#4 Geometry), so a session whose metadata
 * names no seed reads them with any valid one.
 */
const ANY_WORLD_SEED = 0

export interface FrameCostRow {
  runId: string
  commit: string
  planet: number
  band: number
  /** Seconds of frames, one `perf_sample` each. */
  samples: number
  medianFrameMsP95: number
  worstFrameMsP99: number
  longTasks: number
  secondsOverBudget: number
}

type PerfSample = RunEvent<'perf_sample'>

interface BandSeconds {
  planet: number
  band: number
  samples: PerfSample[]
}

export function frameCostRowsOf(sessions: readonly SessionLog[]): FrameCostRow[] {
  return sessions.flatMap(frameCostRowsOfSession)
}

function frameCostRowsOfSession(session: SessionLog): FrameCostRow[] {
  const groups = groupByPlanetAndBand(session, eventsNamed(session, 'perf_sample'))
  return groups.map((group) => frameCostRowOf(session, group))
}

function groupByPlanetAndBand(session: SessionLog, samples: readonly PerfSample[]): BandSeconds[] {
  const bandOf = createBandReader(session.worldSeed ?? ANY_WORLD_SEED)
  const groups = new Map<string, BandSeconds>()
  for (const sample of [...samples].sort(byPlanetThenDepth)) {
    const band = bandOf(sample)
    const key = `${sample.planet}#${band}`
    const group = groups.get(key) ?? { planet: sample.planet, band, samples: [] }
    group.samples.push(sample)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function byPlanetThenDepth(a: PerfSample, b: PerfSample): number {
  return a.planet - b.planet || a.depthTiles - b.depthTiles || a.tick - b.tick
}

/** The band of the depth on the dock's column, as the HUD reads it; params once per planet. */
function createBandReader(worldSeed: number): (sample: PerfSample) => number {
  const paramsByPlanet = new Map<number, PlanetParams>()
  return ({ planet, depthTiles }) => {
    const params = paramsByPlanet.get(planet) ?? planetParamsFor(worldSeed, planet)
    paramsByPlanet.set(planet, params)
    return bandOfTile(params, 0, surfaceRowOfColumn(0, params.radiusTiles) - depthTiles)
  }
}

function frameCostRowOf(session: SessionLog, { planet, band, samples }: BandSeconds): FrameCostRow {
  return {
    runId: session.runId,
    commit: session.commit,
    planet,
    band,
    samples: samples.length,
    medianFrameMsP95: medianOf(samples.map((sample) => sample.data.frameMsP95)) ?? 0,
    worstFrameMsP99: Math.max(...samples.map((sample) => sample.data.frameMsP99)),
    longTasks: samples.reduce((total, sample) => total + sample.data.longTasks, 0),
    secondsOverBudget: samples.filter(isOverFrameBudget).length,
  }
}

/** A second whose p95 frame missed the #38 budget of 16.7 ms. */
export function isOverFrameBudget(sample: PerfSample): boolean {
  return sample.data.frameMsP95 > FRAME_BUDGET_MS
}
