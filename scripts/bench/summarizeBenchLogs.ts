/**
 * Reads every bench run folder under `logs/` (written by the benches with `--log`, #124), checks
 * each line against the run-event schema and prints the results as a Markdown table, also into the
 * GitHub job summary when there is one. Report only: slow numbers never fail it; a malformed line
 * or no bench log at all does, since then the logs CI uploads are not the run-log format.
 *
 *   npm run bench:summary
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { formatBenchmarkSummary } from '../../src/logging/benchmarkResult'
import { parseNdjson } from '../../src/logging/ndjson'
import type { RunEvent } from '../../src/logging/runEvent'
import { runEventProblems } from '../../src/logging/runEventSchema'

const LOGS_FOLDER = new URL('../../logs/', import.meta.url)

function benchEventFiles(): URL[] {
  if (!existsSync(LOGS_FOLDER)) return []
  return readdirSync(LOGS_FOLDER)
    .filter((runId) => runId.includes('_bench-'))
    .map((runId) => new URL(`${runId}/events.ndjson`, LOGS_FOLDER))
    .filter((file) => existsSync(file))
}

function problemsOf(events: readonly RunEvent[]): string[] {
  return events.flatMap((event) =>
    runEventProblems(event).map((problem) => `${event.runId} seq ${event.seq}: ${problem}`),
  )
}

function failWith(problems: readonly string[]): never {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

const events = benchEventFiles().flatMap((file) => parseNdjson(readFileSync(file, 'utf8')))
if (events.length === 0) failWith(['no benchmark_result lines under logs/*_bench-*/'])
const problems = problemsOf(events)
if (problems.length > 0) failWith(problems)
const summary = `## Benchmarks (report only, not gated)\n\n${formatBenchmarkSummary(events)}\n`
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
