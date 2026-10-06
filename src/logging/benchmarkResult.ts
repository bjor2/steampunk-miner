/**
 * The `benchmark_result` lines a bench script writes with `--log` (#124, logging strategy sections
 * 2 and 5): one line per timed series in the bench's own run folder, so CI and local bench runs
 * share the run-log format. The script supplies the run id, the commit and the wall clock.
 */
import { createMemorySink } from './eventSink'
import type { RunEventData } from './eventNames'
import type { RunEvent, RunEventStamp } from './runEvent'
import { createRunLog, type RunLog } from './runLog'

/** One series a bench timed on one planet, its samples in milliseconds. */
export interface BenchmarkSeries {
  name: string
  planet: number
  timesMs: readonly number[]
}

export interface BenchmarkRun {
  runId: string
  /** The commit the bench measured. */
  commit: string
  /** Wall seconds since the bench started; for humans only, as on every run event. */
  secondsSinceStart: () => number
}

export type BenchmarkResult = RunEventData<'benchmark_result'>

export function benchmarkResultEvents(
  run: BenchmarkRun,
  series: readonly BenchmarkSeries[],
): readonly RunEvent[] {
  const sink = createMemorySink()
  recordBenchmarkSeries(createRunLog({ ...run, sink }), series, run.commit)
  return sink.events
}

function recordBenchmarkSeries(
  runLog: RunLog,
  series: readonly BenchmarkSeries[],
  commit: string,
): void {
  for (const one of series) {
    runLog.record(benchStampOf(one.planet), 'benchmark_result', benchmarkResultOf(one, commit))
  }
}

/** A bench is no player and no tick: the envelope says so with fixed values. */
function benchStampOf(planet: number): RunEventStamp {
  return { playerId: 'bench', planet, depthTiles: 0, tick: 0 }
}

export function benchmarkResultOf(series: BenchmarkSeries, commit: string): BenchmarkResult {
  return {
    name: series.name,
    medianUs: microsecondsOf(percentileOf(series.timesMs, 0.5)),
    p95Us: microsecondsOf(percentileOf(series.timesMs, 0.95)),
    runs: series.timesMs.length,
    commit,
  }
}

/** The bench scripts' percentile: the sorted sample at floor(n * fraction), clamped to the last. */
export function percentileOf(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function microsecondsOf(ms: number): number {
  return Math.round(ms * 1000)
}

/** A Markdown table of the logged results, for the CI job summary; other events are skipped. */
export function formatBenchmarkSummary(events: readonly RunEvent[]): string {
  return [
    '| bench | planet | median ms | p95 ms | samples | commit |',
    '| --- | --- | --- | --- | --- | --- |',
    ...events.filter(isBenchmarkResult).map(formatBenchmarkRow),
  ].join('\n')
}

function isBenchmarkResult(event: RunEvent): event is RunEvent<'benchmark_result'> {
  return event.event === 'benchmark_result'
}

function formatBenchmarkRow({ planet, data }: RunEvent<'benchmark_result'>): string {
  const cells = [
    data.name,
    planet,
    millisecondsText(data.medianUs),
    millisecondsText(data.p95Us),
    data.runs,
    data.commit.slice(0, 7),
  ]
  return `| ${cells.join(' | ')} |`
}

function millisecondsText(us: number): string {
  return (us / 1000).toFixed(3)
}
