// CI wrapper of testMetrics.mjs (run by .github/workflows/record-test-metrics.yml): writes this
// run's record into a checkout of the `test-metrics` branch and rebuilds its summary.json.
//
//   METRICS_DIR=<checkout> TEST_REPORT=<vitest json> TEST_JOBS=<actions jobs json> \
//   TEST_JOB=verify TEST_MODE=scoped TEST_REASON=... node scripts/ci/recordTestRun.mjs
//
// The box Tester (claude-sessions/steampunk-loop/tester.sh) sets the same GITHUB_* names itself
// (run id = epoch ms, so box runs sort after Actions runs) plus TEST_SOURCE=box, TEST_PHASE and
// TEST_RUN_URL, and passes a one-job jobs file it writes from its own step times.
//
// A missing report or jobs file is recorded as such, never an error: the record of a cancelled
// or crashed run is the one worth having.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildRunRecord, rollUpSummary } from './testMetrics.mjs'

const RUNS_DIR = 'runs'
const SUMMARY_FILE = 'summary.json'
const RUN_FILES_READ = 400

function readJsonOrNull(path) {
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function runContextOf(env, job) {
  const id = Number(env.GITHUB_RUN_ID)
  return {
    id,
    attempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
    url: env.TEST_RUN_URL || `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${id}`,
    // box: the loop's Tester on the build box (scripts run outside Actions); actions: older records.
    source: env.TEST_SOURCE || 'actions',
    phase: env.TEST_PHASE || null,
    // The feature (parent issue, or a parentless ticket) whose completion this run tests.
    feature: Number(env.TEST_FEATURE) || null,
    tickets: (env.TEST_TICKETS || '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number),
    workflow: env.GITHUB_WORKFLOW,
    job: env.TEST_JOB,
    event: env.GITHUB_EVENT_NAME,
    mode: env.TEST_MODE || 'unknown',
    reason: env.TEST_REASON || '',
    sha: env.GITHUB_SHA,
    branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
    runnerOs: env.RUNNER_OS ?? null,
    runnerLabel: job?.labels?.[0] ?? null,
    timeoutMinutes: Number(env.TEST_TIMEOUT_MINUTES || 10),
    recordedAt: new Date().toISOString(),
  }
}

function runFilePathOf(record) {
  const month = (record.run.startedAt ?? record.run.recordedAt).slice(0, 7)
  const suffix = record.run.attempt > 1 ? `-a${record.run.attempt}` : ''
  return join(RUNS_DIR, month, `${record.run.id}${suffix}.json`)
}

function writeRunRecord(dir, record) {
  const path = join(dir, runFilePathOf(record))
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record)}\n`)
  return path
}

const runIdOfPath = (path) => Number(/(\d+)(?:-a\d+)?\.json$/.exec(path)?.[1] ?? 0)

function readRecentRunRecords(dir) {
  const root = join(dir, RUNS_DIR)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.json'))
    .sort((a, b) => runIdOfPath(a) - runIdOfPath(b))
    .slice(-RUN_FILES_READ)
    .map((path) => readJsonOrNull(join(root, path)))
    .filter((record) => record?.schema === 1)
}

function writeSummary(dir) {
  const summary = rollUpSummary(readRecentRunRecords(dir))
  writeFileSync(join(dir, SUMMARY_FILE), `${JSON.stringify(summary, null, 1)}\n`)
  return summary
}

function findTestJob(env) {
  const jobs = readJsonOrNull(env.TEST_JOBS)?.jobs ?? []
  return jobs.find((job) => job.name === env.TEST_JOB) ?? null
}

function recordTestRun(env) {
  const job = findTestJob(env)
  const record = buildRunRecord({
    report: readJsonOrNull(env.TEST_REPORT),
    context: runContextOf(env, job),
    job,
    root: env.TEST_ROOT ?? '',
    keepAllTests: env.TEST_KEEP_ALL === '1',
  })
  const path = writeRunRecord(env.METRICS_DIR, record)
  const summary = writeSummary(env.METRICS_DIR)
  return { path, record, summary }
}

const { path, record, summary } = recordTestRun(process.env)
const { files, tests, failed, reportFound } = record.totals
console.log(
  `Recorded ${path}: ${record.run.mode}, ${files} files, ${tests} tests, ${failed} failed` +
    `${reportFound ? '' : ' (no Vitest report)'}; summary covers ${summary.runs.length} runs.`,
)
