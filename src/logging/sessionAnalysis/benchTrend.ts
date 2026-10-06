/**
 * The benchmark trend per commit (#125, logging strategy section 6 step 3): every
 * `benchmark_result` line (#124) of the collected bench run folders, one point per commit and
 * series, flagged when its median is more than 10% above the median of the commits measured in the
 * 7 days before it. Points are kept apart by source, since a CI runner and the shared box are two
 * machines whose times never mix.
 */
import type { RunEvent } from '../runEvent'
import { eventsNamed, type SessionLog } from './sessionTable'
import { medianOf } from './trendMaths'

/** Strategy section 6: "flag > 10 % regression against the 7-day median". */
export const REGRESSION_PERCENT = 10
export const BASELINE_DAYS = 7
const MS_PER_DAY = 86_400_000
const HUNDRED = 100

export interface BenchTrendRow {
  source: string
  /** The bench's series name and the planet it ran on: `generateChunk p1`. */
  series: string
  commit: string
  /** The earliest start of the commit's bench runs, ms since 1970 (UTC). */
  measuredAtMs: number
  /** `benchmark_result` lines of this commit and series: one per bench run. */
  results: number
  medianUs: number
  p95Us: number
  /** Median of the other commits' medians in the 7 days before; null when there were none. */
  baselineUs: number | null
  baselineCommits: number
  changePercent: number | null
  isRegression: boolean
}

interface BenchPoint {
  source: string
  series: string
  commit: string
  atMs: number
  medianUs: number
  p95Us: number
}

type CommitPoint = Omit<
  BenchTrendRow,
  'baselineUs' | 'baselineCommits' | 'changePercent' | 'isRegression'
>

/** Rows by source and series, each series oldest commit first. */
export function benchTrendOf(sessions: readonly SessionLog[]): BenchTrendRow[] {
  const series = groupBy(
    sessions.flatMap(benchPointsOf),
    (point) => `${point.source}|${point.series}`,
  )
  return [...series.keys()].sort().flatMap((key) => seriesTrendOf(series.get(key) ?? []))
}

function benchPointsOf(session: SessionLog): BenchPoint[] {
  const atMs = session.startedAtMs
  if (atMs === null) return []
  return eventsNamed(session, 'benchmark_result').map((line) => benchPointOf(session, atMs, line))
}

function benchPointOf(
  session: SessionLog,
  atMs: number,
  { planet, data }: RunEvent<'benchmark_result'>,
): BenchPoint {
  return {
    source: session.source,
    series: `${data.name} p${planet}`,
    commit: session.commit,
    atMs,
    medianUs: data.medianUs,
    p95Us: data.p95Us,
  }
}

function seriesTrendOf(points: readonly BenchPoint[]): BenchTrendRow[] {
  const commits = [...groupBy(points, (point) => point.commit).values()]
    .map(commitPointOf)
    .sort((a, b) => a.measuredAtMs - b.measuredAtMs)
  return commits.map((commit) => judgeAgainstBaseline(commit, commits))
}

/** Several runs of one commit read as their medians. */
function commitPointOf(points: readonly BenchPoint[]): CommitPoint {
  return {
    source: points[0].source,
    series: points[0].series,
    commit: points[0].commit,
    measuredAtMs: Math.min(...points.map((point) => point.atMs)),
    results: points.length,
    medianUs: medianOf(points.map((point) => point.medianUs)) ?? 0,
    p95Us: medianOf(points.map((point) => point.p95Us)) ?? 0,
  }
}

function judgeAgainstBaseline(point: CommitPoint, all: readonly CommitPoint[]): BenchTrendRow {
  const window = all.filter((other) => isInBaselineWindow(other, point))
  const baselineUs = medianOf(window.map((other) => other.medianUs))
  const changePercent =
    baselineUs === null || baselineUs === 0 ? null : percentChange(point.medianUs, baselineUs)
  return {
    ...point,
    baselineUs,
    baselineCommits: window.length,
    changePercent,
    isRegression: changePercent !== null && changePercent > REGRESSION_PERCENT,
  }
}

/** Another commit measured in the 7 days before this one. */
function isInBaselineWindow(other: CommitPoint, point: CommitPoint): boolean {
  const age = point.measuredAtMs - other.measuredAtMs
  return other.commit !== point.commit && age > 0 && age <= BASELINE_DAYS * MS_PER_DAY
}

function percentChange(value: number, baseline: number): number {
  return ((value - baseline) * HUNDRED) / baseline
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(keyOf(item)) ?? []
    group.push(item)
    groups.set(keyOf(item), group)
  }
  return groups
}
