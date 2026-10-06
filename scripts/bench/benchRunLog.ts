/**
 * `--log` for the bench scripts (#124): writes the timed series as `benchmark_result` lines to the
 * bench's own run folder, `logs/<runId>/events.ndjson` (design doc section 23), and names the file
 * on stderr. Without the flag nothing is written, and the JSON lines on stdout never change
 * (`perf:record` parses them).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { benchmarkResultEvents, type BenchmarkSeries } from '../../src/logging/benchmarkResult'
import { formatNdjsonLine } from '../../src/logging/ndjson'
import { createRunId, runFilePaths } from '../../src/logging/runLayout'

const REPO_ROOT = new URL('../../', import.meta.url)

export function logBenchmarkSeriesWhenAsked(bench: string, series: readonly BenchmarkSeries[]) {
  if (!process.argv.includes('--log')) return
  writeBenchmarkRunLog(benchRunIdOf(bench), series)
}

/** The run id with the bench's name, so benches started in the same second get their own folder. */
function benchRunIdOf(bench: string): string {
  return `${createRunId(new Date())}_bench-${bench}`
}

function writeBenchmarkRunLog(runId: string, series: readonly BenchmarkSeries[]): void {
  const events = benchmarkResultEvents(
    { runId, commit: measuredCommit(), secondsSinceStart: () => performance.now() / 1000 },
    series,
  )
  const file = new URL(runFilePaths(runId).events, REPO_ROOT)
  mkdirSync(new URL('.', file), { recursive: true })
  writeFileSync(file, events.map(formatNdjsonLine).join(''))
  console.error(`benchmark_result: ${runFilePaths(runId).events}`)
}

/** CI names the commit it checked out; a local run asks git; outside a checkout it is unknown. */
function measuredCommit(): string {
  return process.env.GITHUB_SHA ?? headCommitOrUnknown()
}

function headCommitOrUnknown(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
