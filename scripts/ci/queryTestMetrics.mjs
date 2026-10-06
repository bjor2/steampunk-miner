// `npm run metrics:tests [-- <view>] [--limit N] [--summary <file>]`: reads the CI test metrics
// from the orphan `test-metrics` branch (fetched from origin; summary.json, schema in
// docs/metrics/test-metrics.md) and prints one view, or all of them:
//   features   slowest features (sum of their files' p50 over the last runs)
//   files      slowest files by p50
//   pass-rate  files and features with the lowest pass rate, flaky files first
//   failures   the most recent failing files, with run, commit and tests
//   pipeline   runs per mode, timeouts, runs without a report, scoping suspects
//   runs       the latest runs: mode, duration, conclusion
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const BRANCH = 'test-metrics'
const VIEWS = ['features', 'files', 'pass-rate', 'failures', 'pipeline', 'runs']

function readOptions(argv) {
  const option = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : argv[at + 1]
  }
  const values = new Set([option('--limit'), option('--summary')])
  const view = argv.find((arg) => !arg.startsWith('--') && !values.has(arg))
  return { view, limit: Number(option('--limit') ?? 15), summaryFile: option('--summary') }
}

function fetchSummaryText() {
  try {
    execFileSync(
      'git',
      ['fetch', '--quiet', 'origin', `+${BRANCH}:refs/remotes/origin/${BRANCH}`],
      {
        stdio: 'ignore',
      },
    )
  } catch {
    console.error(`(could not fetch origin/${BRANCH}; using the last fetched copy)`)
  }
  return execFileSync('git', ['show', `origin/${BRANCH}:summary.json`], { encoding: 'utf8' })
}

const seconds = (ms) => (ms === null || ms === undefined ? '-' : `${(ms / 1000).toFixed(1)}s`)
const percent = (rate) => `${Math.round(rate * 100)}%`
const shortSha = (sha) => (sha ?? '').slice(0, 7)

function printTable(title, rows) {
  console.log(`\n${title}`)
  if (rows.length === 0) console.log('  (none)')
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => String(row[column]).length)),
  )
  for (const row of rows)
    console.log(`  ${row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ')}`)
}

function printFeatures(summary, limit) {
  const rows = Object.entries(summary.features)
    .sort(([, a], [, b]) => b.p50Ms - a.p50Ms)
    .slice(0, limit)
    .map(([name, f]) => [
      name,
      `${f.files} files`,
      `p50 ${seconds(f.p50Ms)}`,
      `p95 ${seconds(f.p95Ms)}`,
      `pass ${percent(f.passRate)}`,
    ])
  printTable('Slowest features (sum of file p50 / p95)', rows)
}

function printFiles(summary, limit) {
  const rows = Object.entries(summary.files)
    .sort(([, a], [, b]) => b.p50Ms - a.p50Ms)
    .slice(0, limit)
    .map(([path, f]) => [
      path,
      f.feature,
      `p50 ${seconds(f.p50Ms)}`,
      `p95 ${seconds(f.p95Ms)}`,
      `${f.runs} runs`,
    ])
  printTable('Slowest files', rows)
}

function printPassRates(summary, limit) {
  const rows = Object.entries(summary.files)
    .filter(([, f]) => f.passRate < 1)
    .sort(([, a], [, b]) => Number(b.flaky) - Number(a.flaky) || a.passRate - b.passRate)
    .slice(0, limit)
    .map(([path, f]) => [
      path,
      f.feature,
      `pass ${percent(f.passRate)} of ${f.runs}`,
      f.flaky ? 'flaky (pass and fail on one commit)' : '',
    ])
  printTable('Lowest pass rate (files)', rows)
}

function printFailures(summary, limit) {
  const rows = Object.entries(summary.files)
    .filter(([, f]) => f.lastFailure)
    .sort(([, a], [, b]) => b.lastFailure.runId - a.lastFailure.runId)
    .slice(0, limit)
    .map(([path, f]) => [
      path,
      `run ${f.lastFailure.runId}`,
      shortSha(f.lastFailure.sha),
      f.lastFailure.at ?? '',
      f.lastFailure.tests.filter(Boolean).slice(0, 2).join(' | '),
    ])
  printTable('Recent failures', rows)
}

function printPipeline(summary) {
  const { modes, timedOut, withoutReport, scopingSuspects } = summary.pipeline
  console.log('\nPipeline')
  console.log(
    `  runs per mode: ${Object.entries(modes)
      .map(([mode, n]) => `${mode} ${n}`)
      .join(', ')}`,
  )
  console.log(`  timed out: ${timedOut.join(', ') || 'none'}`)
  console.log(`  no Vitest report: ${withoutReport.join(', ') || 'none'}`)
  const suspects = scopingSuspects.map(
    (s) => `${s.file} (per push: ${s.lastPerPushStatus ?? 'not run'})`,
  )
  console.log(`  failed nightly but not per push: ${suspects.join(', ') || 'none'}`)
}

function printRuns(summary, limit) {
  const rows = summary.runs
    .slice(-limit)
    .reverse()
    .map((r) => [
      r.id,
      r.event,
      r.mode,
      shortSha(r.sha),
      r.startedAt ?? '',
      `${r.jobDurationSec ?? '-'}s`,
      r.timedOut ? 'TIMED OUT' : (r.jobConclusion ?? '-'),
      `${r.files} files`,
      `${r.failed} failed`,
    ])
  printTable('Latest runs', rows)
}

const PRINTERS = {
  features: printFeatures,
  files: printFiles,
  'pass-rate': printPassRates,
  failures: printFailures,
  pipeline: printPipeline,
  runs: printRuns,
}

function queryTestMetrics(argv) {
  const { view, limit, summaryFile } = readOptions(argv)
  if (view && !VIEWS.includes(view))
    throw new Error(`Unknown view "${view}"; one of ${VIEWS.join(', ')}`)
  const summary = JSON.parse(summaryFile ? readFileSync(summaryFile, 'utf8') : fetchSummaryText())
  console.log(
    `test-metrics summary of the last ${summary.runs.length} CI runs, updated ${summary.updatedAt}`,
  )
  for (const name of view ? [view] : VIEWS) PRINTERS[name](summary, limit)
}

queryTestMetrics(process.argv.slice(2))
