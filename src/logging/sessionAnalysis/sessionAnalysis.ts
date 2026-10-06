/**
 * One pass of the analysis loop (#125, logging strategy section 6 steps 3 and 4) over the session
 * table: every analysis the strategy lists, and the short text summary that goes beside the HTML
 * page. Report only: nothing here judges a build or opens an issue; a flag is for a reader.
 */
import { FRAME_BUDGET_MS } from '../../constants/scene'
import { benchTrendOf, REGRESSION_PERCENT, type BenchTrendRow } from './benchTrend'
import { frameCostRowsOf, type FrameCostRow } from './frameCost'
import { frameStretchesOf, slowdownsByOreBefore, type FrameStretch } from './frameStretches'
import { countTrendsOf, heapTrendsOf, type CountTrend, type HeapTrend } from './memoryTrend'
import { summaryComparisonsOf, type SessionComparison } from './summaryComparison'
import type { RefusedSession, SessionLog, SessionTable } from './sessionTable'

export interface SessionAnalysis {
  sessions: SessionLog[]
  refused: RefusedSession[]
  heapTrends: HeapTrend[]
  countTrends: CountTrend[]
  frameCost: FrameCostRow[]
  slowdowns: FrameStretch[]
  longTaskBursts: FrameStretch[]
  /** `[oreId, slowdowns it came right before]`, most first. */
  slowdownsByOre: [string, number][]
  benchTrend: BenchTrendRow[]
  comparisons: SessionComparison[]
}

export function analyzeSessions({ sessions, refused }: SessionTable): SessionAnalysis {
  const slowdowns = frameStretchesOf(sessions, 'slowdown')
  return {
    sessions,
    refused,
    heapTrends: heapTrendsOf(sessions),
    countTrends: countTrendsOf(sessions),
    frameCost: frameCostRowsOf(sessions),
    slowdowns,
    longTaskBursts: frameStretchesOf(sessions, 'longTaskBurst'),
    slowdownsByOre: mostFirst(slowdownsByOreBefore(slowdowns)),
    benchTrend: benchTrendOf(sessions),
    comparisons: summaryComparisonsOf(sessions),
  }
}

function mostFirst(counts: Map<string, number>): [string, number][] {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** The few lines a reader needs before opening the page. */
export function formatAnalysisSummary(analysis: SessionAnalysis): string {
  return [
    sessionsLine(analysis),
    heapLine(analysis.heapTrends),
    countsLine(analysis.countTrends),
    framesLine(analysis),
    oresLine(analysis.slowdownsByOre),
    benchLine(analysis.benchTrend),
    comparisonsLine(analysis.comparisons),
  ].join('\n')
}

function sessionsLine({ sessions, refused }: SessionAnalysis): string {
  const commits = new Set(sessions.map((session) => session.commit)).size
  const bySource = countsOf(sessions.map((session) => session.source))
  const sources = [...bySource].map(([source, count]) => `${count} ${source}`).join(', ')
  return (
    `Sessions: ${sessions.length} (${sources || 'none'}) on ${commits} commit(s)` +
    (refused.length > 0 ? `, ${refused.length} refused` : '')
  )
}

function countsOf(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function heapLine(trends: readonly HeapTrend[]): string {
  const steepest = [...trends]
    .filter((trend) => trend.mbPer10Minutes !== null)
    .sort((a, b) => (b.mbPer10Minutes ?? 0) - (a.mbPer10Minutes ?? 0))[0]
  if (steepest === undefined) return 'Heap: no session with memory samples after warm-up'
  return (
    `Heap: steepest ${signedText(steepest.mbPer10Minutes, 1)} MB per 10 min, ` +
    `${signedText(steepest.mbPer100Minerals, 1)} MB per 100 minerals ` +
    `(${steepest.runId} at ${steepest.commit}, ${steepest.samples} samples)`
  )
}

function countsLine(trends: readonly CountTrend[]): string {
  const climbing = trends.filter((trend) => trend.isClimbing)
  if (trends.length === 0) return 'Counts: no memory samples'
  if (climbing.length === 0) return 'Counts: geometries, textures and colliders flat after warm-up'
  return `Counts climbing: ${climbing.map(climbingText).join('; ')}`
}

function climbingText(trend: CountTrend): string {
  return `${trend.count} ${trend.first} → ${trend.last} in ${trend.runId}`
}

function framesLine({ slowdowns, longTaskBursts, frameCost }: SessionAnalysis): string {
  if (frameCost.length === 0) return 'Frames: no perf samples'
  const longest = [...slowdowns].sort((a, b) => b.seconds - a.seconds)[0]
  const longestText =
    longest === undefined ? '' : ` (longest ${longest.seconds} s in ${longest.runId})`
  return (
    `Frames: ${slowdowns.length} slowdown(s) over the ${FRAME_BUDGET_MS} ms budget${longestText}, ` +
    `${longTaskBursts.length} long-task burst(s)`
  )
}

function oresLine(slowdownsByOre: readonly [string, number][]): string {
  if (slowdownsByOre.length === 0) return 'Mined order: no ore collected before a slowdown'
  const ores = slowdownsByOre.map(([oreId, count]) => `${oreId} ×${count}`).join(', ')
  return `Slowdowns came right after: ${ores}`
}

function benchLine(rows: readonly BenchTrendRow[]): string {
  if (rows.length === 0) return 'Bench: no benchmark_result lines'
  const flagged = rows.filter((row) => row.isRegression)
  const judged = rows.filter((row) => row.baselineUs !== null).length
  if (flagged.length === 0)
    return `Bench: ${rows.length} commit points, ${judged} judged, none > ${REGRESSION_PERCENT}% over its 7-day median`
  return `Bench: ${flagged.length} point(s) > ${REGRESSION_PERCENT}% over the 7-day median: ${flagged.map(regressionText).join('; ')}`
}

function regressionText(row: BenchTrendRow): string {
  return (
    `${row.source} ${row.series} at ${row.commit} ${signedText(row.changePercent, 0)}% ` +
    `(${row.medianUs} vs ${row.baselineUs} µs)`
  )
}

function comparisonsLine(comparisons: readonly SessionComparison[]): string {
  if (comparisons.length === 0) return 'Summaries: no seed played on two commits'
  return `Summaries: ${comparisons.length} seed(s) compared across commits (see the page)`
}

export function signedText(value: number | null, decimals: number): string {
  if (value === null) return 'n/a'
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`
}
