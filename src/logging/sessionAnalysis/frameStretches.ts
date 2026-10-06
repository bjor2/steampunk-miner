/**
 * Slowdowns and long-task bursts, per session, lined up with the mined order (#125, logging
 * strategy sections 4 and 6): a slowdown is a run of back-to-back seconds whose p95 frame missed
 * the #38 budget, a burst a run of seconds with frames over 50 ms (#121 `longTasks`). Each names
 * the ore, its depth and chunk last collected before it started (#122 `resource_collected`), so a
 * slow build shows which mineral, depth or chunk preceded the slowdown, ready to replay to.
 */
import type { RunEvent } from '../runEvent'
import { isOverFrameBudget } from './frameCost'
import { eventsNamed, type SessionLog } from './sessionTable'

export type StretchKind = 'slowdown' | 'longTaskBurst'

export interface MineralBefore {
  oreId: string
  oreDepthTiles: number
  chunk: string
  /** Ticks from its collection to the stretch's first second. */
  ticksBefore: number
}

export interface FrameStretch {
  runId: string
  commit: string
  kind: StretchKind
  fromTick: number
  toTick: number
  /** One `perf_sample` per second of frames. */
  seconds: number
  worstFrameMsP99: number
  longTasks: number
  planet: number
  depthTiles: number
  /** Null when nothing was collected before it (or the run logs no detail lines). */
  mineralBefore: MineralBefore | null
}

type PerfSample = RunEvent<'perf_sample'>
type Collected = RunEvent<'resource_collected'>

const IS_IN_STRETCH: Record<StretchKind, (sample: PerfSample) => boolean> = {
  slowdown: isOverFrameBudget,
  longTaskBurst: (sample) => sample.data.longTasks > 0,
}

export function frameStretchesOf(sessions: readonly SessionLog[], kind: StretchKind) {
  return sessions.flatMap((session) => frameStretchesOfSession(session, kind))
}

function frameStretchesOfSession(session: SessionLog, kind: StretchKind): FrameStretch[] {
  const runs = runsWhere(eventsNamed(session, 'perf_sample'), IS_IN_STRETCH[kind])
  const collected = eventsNamed(session, 'resource_collected')
  return runs.map((samples) => frameStretchOf(session, kind, samples, collected))
}

/** Back-to-back samples that pass `isIn`, each run in tick order. */
function runsWhere(
  samples: readonly PerfSample[],
  isIn: (sample: PerfSample) => boolean,
): PerfSample[][] {
  const runs: PerfSample[][] = []
  let current: PerfSample[] = []
  for (const sample of samples) {
    if (isIn(sample)) {
      current.push(sample)
      continue
    }
    if (current.length > 0) runs.push(current)
    current = []
  }
  if (current.length > 0) runs.push(current)
  return runs
}

function frameStretchOf(
  session: SessionLog,
  kind: StretchKind,
  samples: readonly PerfSample[],
  collected: readonly Collected[],
): FrameStretch {
  const first = samples[0]
  return {
    runId: session.runId,
    commit: session.commit,
    kind,
    fromTick: first.tick,
    toTick: samples[samples.length - 1].tick,
    seconds: samples.length,
    worstFrameMsP99: Math.max(...samples.map((sample) => sample.data.frameMsP99)),
    longTasks: samples.reduce((total, sample) => total + sample.data.longTasks, 0),
    planet: first.planet,
    depthTiles: first.depthTiles,
    mineralBefore: mineralBefore(collected, first),
  }
}

/** The last ore collected at or before the stretch's first second, by the run's own order. */
function mineralBefore(collected: readonly Collected[], first: PerfSample): MineralBefore | null {
  const last = collected.filter((line) => line.seq < first.seq).at(-1)
  if (last === undefined) return null
  return {
    oreId: last.data.oreId,
    oreDepthTiles: last.data.oreDepthTiles,
    chunk: last.data.chunk,
    ticksBefore: first.tick - last.tick,
  }
}

/** How many slowdowns each ore came right before: the mined-order alignment's headline. */
export function slowdownsByOreBefore(stretches: readonly FrameStretch[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { mineralBefore: ore } of stretches) {
    if (ore !== null) counts.set(ore.oreId, (counts.get(ore.oreId) ?? 0) + 1)
  }
  return counts
}
