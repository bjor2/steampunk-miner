/**
 * The field lines' slice bench (GD ruling on #293 Q1, the measured raise of #213's line): a rig
 * descends P43 (endless Lodestone, past P40) at the 16 m/s top speed, 60 frames a second, and each
 * frame is timed before (no layer) and after (the layer's frame work: the look-ahead window, and a
 * re-pick with the buffer rewrite when the window reaches other chunks), alternating so load drift
 * lands on both. The clock is the caller's (`npm run bench:render` passes `performance.now`), so
 * nothing here reads time itself. Reached through the debug action `timeFieldArcFrames`.
 */
import { MAX_SPEED_MM_PER_SECOND } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import { planetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import {
  createFieldArcBuffer,
  refreshFieldArcs,
  type FieldArcBuffer,
  type FieldArcPose,
} from './systems/render/fieldArcBuffer'

/** Endless Lodestone: magnetic, and past P40. */
export const FIELD_ARC_BENCH_PLANET = 43
const FPS = 60
const SECONDS = 30
const START_DEPTH_M = 4
const TOP_SPEED_M_PER_S = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE

export interface FieldArcFrameTimes {
  planetIndex: number
  /** Each frame with no layer, ms. */
  before: number[]
  /** Each frame with the layer's work, ms. */
  after: number[]
  /** The frames that re-picked the arcs, ms. */
  picks: number[]
  /** Arcs picked last. */
  arcs: number
  /** Times the vertex buffer was replaced: the ruling wants none. */
  bufferReallocations: number
}

/** A warm-up descent, then the timed one, on a fresh buffer each. */
export function timeFieldArcFrames(worldSeed: number, nowMs: () => number): FieldArcFrameTimes {
  const params = planetParamsFor(worldSeed, FIELD_ARC_BENCH_PLANET)
  descend(params, createFieldArcBuffer(), nowMs)
  const buffer = createFieldArcBuffer()
  const { positions, dash } = buffer
  const times = descend(params, buffer, nowMs)
  return {
    planetIndex: FIELD_ARC_BENCH_PLANET,
    ...times,
    arcs: buffer.arcCount,
    bufferReallocations: Number(buffer.positions !== positions) + Number(buffer.dash !== dash),
  }
}

function descend(params: PlanetParams, buffer: FieldArcBuffer, nowMs: () => number) {
  const times = { before: [] as number[], after: [] as number[], picks: [] as number[] }
  const pose: FieldArcPose = { x: 0.5, y: 0, vx: 0, vy: -TOP_SPEED_M_PER_S }
  for (let frame = 0; frame < FPS * SECONDS; frame++) {
    pose.y = params.radiusTiles - START_DEPTH_M - (TOP_SPEED_M_PER_S * frame) / FPS
    times.before.push(timedMs(nowMs, () => false))
    const start = nowMs()
    const picked = refreshFieldArcs(buffer, params, pose)
    times.after.push(nowMs() - start)
    if (picked) times.picks.push(times.after[times.after.length - 1])
  }
  return times
}

function timedMs(nowMs: () => number, work: () => unknown): number {
  const start = nowMs()
  work()
  return nowMs() - start
}
