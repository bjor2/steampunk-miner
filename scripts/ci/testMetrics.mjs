// Turns a Vitest JSON report plus its CI run into one compact run record, and rolls run records
// up into the summary the status page (#192) and `npm run metrics:tests` read. Pure: the CI
// wrapper (recordTestRun.mjs) does the file and git work. Stored on the orphan `test-metrics`
// branch as runs/YYYY-MM/<run-id>.json and summary.json; schema in docs/metrics/test-metrics.md.
import { featureOfTestFile } from './testFeatures.mjs'

export const RUN_SCHEMA = 1
export const SLOWEST_TESTS_PER_FILE = 3
/** Tests quicker than this are left out of `slowest`, which keeps per-push records small. */
export const SLOWEST_TEST_MIN_MS = 100
export const SUMMARY_RUNS = 50
const FAILURE_MESSAGE_CHARS = 300
const STATUS_OF_ASSERTION = { passed: 'passed', failed: 'failed' }

/** The repo-relative path of a reporter file name: under `root`, else from the first known folder. */
export function relativeTestPath(name, root = '') {
  const path = name.replaceAll('\\', '/')
  const prefix = root.replaceAll('\\', '/').replace(/\/?$/, '/')
  if (root && path.startsWith(prefix)) return path.slice(prefix.length)
  return /(?:^|\/)((?:src|scripts|tests|e2e)\/.*)$/.exec(path)?.[1] ?? path
}

const roundMs = (ms) => Math.round(ms ?? 0)

function countTestsByStatus(assertions) {
  const counts = { tests: assertions.length, passed: 0, failed: 0, skipped: 0 }
  for (const assertion of assertions)
    counts[STATUS_OF_ASSERTION[assertion.status] ?? 'skipped'] += 1
  return counts
}

function slowestTestsOf(assertions) {
  return assertions
    .filter((assertion) => (assertion.duration ?? 0) >= SLOWEST_TEST_MIN_MS)
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
    .slice(0, SLOWEST_TESTS_PER_FILE)
    .map((assertion) => [assertion.fullName, roundMs(assertion.duration)])
}

function failuresOf(fileResult) {
  const failed = fileResult.assertionResults.filter((assertion) => assertion.status === 'failed')
  const tests = failed.map((assertion) => ({
    test: assertion.fullName,
    message: (assertion.failureMessages[0] ?? '').slice(0, FAILURE_MESSAGE_CHARS),
  }))
  // A file that fails outside any test (import error, suite hook) has a message and no failed test.
  if (tests.length === 0 && fileResult.status === 'failed') {
    tests.push({ test: null, message: (fileResult.message ?? '').slice(0, FAILURE_MESSAGE_CHARS) })
  }
  return tests
}

const testDurationsOf = (assertions) =>
  assertions.map((assertion) => [assertion.fullName, roundMs(assertion.duration), assertion.status])

/** One file of the report as a record; `keepAllTests` adds every test's duration and status. */
export function summariseTestFile(fileResult, { root = '', keepAllTests = false } = {}) {
  const file = relativeTestPath(fileResult.name, root)
  const assertions = fileResult.assertionResults ?? []
  const record = {
    file,
    feature: featureOfTestFile(file),
    status: fileResult.status === 'failed' ? 'failed' : 'passed',
    durationMs: roundMs((fileResult.endTime ?? 0) - (fileResult.startTime ?? 0)),
    ...countTestsByStatus(assertions),
    slowest: slowestTestsOf(assertions),
    failures: failuresOf({ ...fileResult, assertionResults: assertions }),
  }
  if (keepAllTests) record.testDurations = testDurationsOf(assertions)
  return record
}

function addFileToFeature(features, file) {
  const total = (features[file.feature] ??= {
    files: 0,
    tests: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  })
  total.files += 1
  total.tests += file.tests
  total.failed += file.failed
  total.skipped += file.skipped
  total.durationMs += file.durationMs
  return features
}

function totalsOf(files, report) {
  const sum = (key) => files.reduce((total, file) => total + file[key], 0)
  const lastEnd = Math.max(0, ...(report?.testResults ?? []).map((file) => file.endTime ?? 0))
  return {
    reportFound: report !== null,
    files: files.length,
    failedFiles: files.filter((file) => file.status === 'failed').length,
    tests: sum('tests'),
    passed: sum('passed'),
    failed: sum('failed'),
    skipped: sum('skipped'),
    wallMs: report && lastEnd ? roundMs(lastEnd - report.startTime) : null,
  }
}

const secondsBetween = (start, end) =>
  start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 1000) : null

function stepTimingsOf(job) {
  return (job?.steps ?? []).map((step) => ({
    name: step.name,
    conclusion: step.conclusion,
    durationSec: secondsBetween(step.started_at, step.completed_at),
  }))
}

function jobFieldsOf(job, timeoutMinutes) {
  const durationSec = secondsBetween(job?.started_at, job?.completed_at)
  const conclusion = job?.conclusion ?? null
  const nearTimeout = durationSec !== null && durationSec >= timeoutMinutes * 60 - 15
  return {
    startedAt: job?.started_at ?? null,
    jobDurationSec: durationSec,
    jobConclusion: conclusion,
    timedOut: conclusion === 'cancelled' && nearTimeout,
  }
}

/**
 * The run record: `context` is the CI run (id, workflow, job, event, mode, reason, sha, branch,
 * runner OS, timeout), `job` the GitHub API job of the test job (steps and times), `report` the
 * Vitest JSON report or null when the run left none (skipped, cancelled, crashed).
 */
export function buildRunRecord({ report, context, job = null, root = '', keepAllTests = false }) {
  const files = (report?.testResults ?? [])
    .map((fileResult) => summariseTestFile(fileResult, { root, keepAllTests }))
    .sort((a, b) => a.file.localeCompare(b.file))
  return {
    schema: RUN_SCHEMA,
    run: { ...context, ...jobFieldsOf(job, context.timeoutMinutes ?? 10) },
    totals: totalsOf(files, report),
    steps: stepTimingsOf(job),
    features: files.reduce(addFileToFeature, {}),
    files,
  }
}

/** The p-th percentile (0..100, nearest rank) of the values; null for none. */
export function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

const isPerPushRun = (record) => record.run.mode !== 'nightly'

function runLineOf(record) {
  const { id, url, event, mode, sha, branch, startedAt, jobConclusion, timedOut, jobDurationSec } =
    record.run
  const { reportFound, files, tests, failed, failedFiles } = record.totals
  return {
    ...{ id, url, event, mode, sha, branch, startedAt, jobConclusion, timedOut, jobDurationSec },
    ...{ reportFound, files, tests, failed, failedFiles },
  }
}

function failureOf(record, file) {
  return {
    runId: record.run.id,
    sha: record.run.sha,
    at: record.run.startedAt,
    tests: file.failures.map((failure) => failure.test),
  }
}

function collectFileHistories(records) {
  const histories = new Map()
  for (const record of records) {
    for (const file of record.files) {
      const history = histories.get(file.file) ?? { feature: file.feature, entries: [] }
      history.entries.push({ record, file })
      histories.set(file.file, history)
    }
  }
  return histories
}

function hasMixedResultsOnOneCommit(entries) {
  const statusesBySha = new Map()
  for (const { record, file } of entries) {
    const statuses = statusesBySha.get(record.run.sha) ?? new Set()
    statuses.add(file.status)
    statusesBySha.set(record.run.sha, statuses)
  }
  return [...statusesBySha.values()].some((statuses) => statuses.size > 1)
}

function fileStatsOf({ feature, entries }) {
  const durations = entries.map(({ file }) => file.durationMs)
  const failures = entries.filter(({ file }) => file.status === 'failed')
  const last = entries.at(-1)
  const lastFailure = failures.at(-1)
  return {
    feature,
    runs: entries.length,
    lastMs: last.file.durationMs,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    passRate: (entries.length - failures.length) / entries.length,
    lastStatus: last.file.status,
    lastRunId: last.record.run.id,
    lastFailure: lastFailure ? failureOf(lastFailure.record, lastFailure.file) : null,
    flaky: hasMixedResultsOnOneCommit(entries),
    slowest: last.file.slowest,
  }
}

function addFileStatsToFeature(features, [path, stats]) {
  const feature = (features[stats.feature] ??= {
    files: 0,
    p50Ms: 0,
    p95Ms: 0,
    fileRuns: 0,
    failedFileRuns: 0,
    lastFailure: null,
  })
  feature.files += 1
  feature.p50Ms += stats.p50Ms
  feature.p95Ms += stats.p95Ms
  feature.fileRuns += stats.runs
  feature.failedFileRuns += Math.round((1 - stats.passRate) * stats.runs)
  const failure = stats.lastFailure && { ...stats.lastFailure, file: path }
  if (failure && (!feature.lastFailure || failure.runId > feature.lastFailure.runId)) {
    feature.lastFailure = failure
  }
  return features
}

function withPassRates(features) {
  for (const feature of Object.values(features)) {
    feature.passRate = (feature.fileRuns - feature.failedFileRuns) / feature.fileRuns
  }
  return features
}

/** Files failing in the latest nightly run that the per-push runs since the previous one passed or never ran. */
function scopingSuspectsOf(records) {
  const nightlies = records.filter((record) => !isPerPushRun(record))
  const latest = nightlies.at(-1)
  if (!latest) return []
  const since = nightlies.at(-2)?.run.id ?? 0
  const perPush = records.filter(
    (r) => isPerPushRun(r) && r.run.id > since && r.run.id < latest.run.id,
  )
  return latest.files
    .filter((file) => file.status === 'failed')
    .map((file) => {
      const seen = perPush.flatMap((r) => r.files.filter((f) => f.file === file.file))
      return {
        file: file.file,
        nightlyRunId: latest.run.id,
        lastPerPushStatus: seen.at(-1)?.status ?? null,
      }
    })
    .filter((suspect) => suspect.lastPerPushStatus !== 'failed')
}

function pipelineOf(records) {
  const modes = {}
  for (const record of records) modes[record.run.mode] = (modes[record.run.mode] ?? 0) + 1
  return {
    modes,
    timedOut: records.filter((r) => r.run.timedOut).map((r) => r.run.id),
    // A green job without a report ran no tests on purpose (a docs-only scoped push); not a problem.
    withoutReport: records
      .filter((r) => !r.totals.reportFound && r.run.jobConclusion !== 'success')
      .map((r) => r.run.id),
    scopingSuspects: scopingSuspectsOf(records),
  }
}

/** The rolled-up summary of the last `lastRuns` records (oldest first by run id). */
export function rollUpSummary(records, { lastRuns = SUMMARY_RUNS, now = new Date() } = {}) {
  const recent = [...records].sort((a, b) => a.run.id - b.run.id).slice(-lastRuns)
  const files = Object.fromEntries(
    [...collectFileHistories(recent)].map(([path, history]) => [path, fileStatsOf(history)]),
  )
  return {
    schema: RUN_SCHEMA,
    updatedAt: now.toISOString(),
    lastRuns,
    runs: recent.map(runLineOf),
    pipeline: pipelineOf(recent),
    features: withPassRates(Object.entries(files).reduce(addFileStatsToFeature, {})),
    files,
  }
}
