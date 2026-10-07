// The per-test history behind the Tests tab's test list (#192): every test of the newest complete
// run that kept each test's duration (`files[].testDurations`, the nightly full suite), with its
// duration and status in each of the last TEST_HISTORY_RUNS such runs, and each file's feature from
// the tests/MANIFEST.md sources. Written next to summary.json on the `test-metrics` branch as
// tests.json (docs/metrics/test-metrics.md), so the page fetches one compact file and no raw report.
// Pure: recordTestRun.mjs does the file work.
import { featureGroupOfTestFile } from '../tests/testFeatureGroups.mjs'

export const TEST_HISTORY_SCHEMA = 1
export const TEST_HISTORY_RUNS = 20
/** A status character per run: passed, failed, skipped (also pending and todo), not run. */
export const STATUS_CHARS = { passed: 'p', failed: 'f', skipped: 's', notRun: '-' }

function keepsEveryTest(record) {
  if (record.totals?.reportFound !== true) return false
  return (record.files ?? []).some((file) => Array.isArray(file.testDurations))
}

const isCompleteRun = (record) =>
  record.run.jobConclusion !== 'cancelled' && record.run.timedOut !== true

function historyRunsOf(records, lastRuns) {
  return records
    .filter(keepsEveryTest)
    .sort((a, b) => a.run.id - b.run.id)
    .slice(-lastRuns)
}

function runLineOf(record) {
  const { id, url, sha, startedAt, job, mode, jobConclusion, timedOut } = record.run
  const { source = 'actions', phase = null } = record.run
  return {
    ...{ id, url, sha, startedAt, source, phase, job, mode },
    conclusion: jobConclusion ?? null,
    timedOut: timedOut === true,
    isComplete: isCompleteRun(record),
  }
}

// A name Vitest reports twice in one file (an it.each row with a fixed title) keeps both rows.
function uniqueNamesOf(testDurations) {
  const seen = new Map()
  return testDurations.map(([name, ms, status]) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return [count === 1 ? name : `${name} (${count})`, [ms, status]]
  })
}

function indexFileOf(file) {
  return {
    ms: file.durationMs,
    status: file.status,
    failedToLoad: file.status === 'failed' && file.tests === 0,
    tests: new Map(uniqueNamesOf(file.testDurations ?? [])),
  }
}

/** A run as `Map<file, { ms, status, failedToLoad, tests: Map<name, [ms, status]> }>`. */
function indexRunOf(record) {
  return new Map(record.files.map((file) => [file.file, indexFileOf(file)]))
}

// The run whose tests are listed: the newest complete one, else the newest at all.
function currentIndexOf(records) {
  const complete = records.findLastIndex(isCompleteRun)
  return complete >= 0 ? complete : records.length - 1
}

// A file that failed to load in the current run keeps the tests it had in the newest run before.
function currentTestNamesOf(path, indexed, current) {
  const file = indexed[current].get(path)
  if (!file.failedToLoad) return [...file.tests.keys()]
  const before = indexed.slice(0, current).findLast((run) => run.get(path)?.tests.size)
  return before ? [...before.get(path).tests.keys()] : []
}

function statusCharOf(status) {
  return STATUS_CHARS[status] ?? STATUS_CHARS.skipped
}

function statusCharAt(file, point) {
  if (point) return statusCharOf(point[1])
  return file?.failedToLoad ? STATUS_CHARS.failed : STATUS_CHARS.notRun
}

/** `[ms per run (null when not run), one status character per run]`. */
function testSeriesOf(path, name, indexed) {
  const ms = []
  let statuses = ''
  for (const run of indexed) {
    const file = run.get(path)
    const point = file?.tests.get(name)
    ms.push(point ? point[0] : null)
    statuses += statusCharAt(file, point)
  }
  return [ms, statuses]
}

function fileHistoryOf(path, indexed, current) {
  const names = currentTestNamesOf(path, indexed, current)
  return {
    ...featureGroupOfTestFile(path),
    status: indexed[current].get(path).status,
    ms: indexed.map((run) => run.get(path)?.ms ?? null),
    tests: Object.fromEntries(names.map((name) => [name, testSeriesOf(path, name, indexed)])),
  }
}

function filesOf(indexed, current) {
  if (current < 0) return {}
  const paths = [...indexed[current].keys()].sort()
  return Object.fromEntries(paths.map((path) => [path, fileHistoryOf(path, indexed, current)]))
}

/**
 * tests.json from run records (any order): the runs that kept every test's duration, oldest
 * first, and the tests of the current run (`currentRunId`) with one point per run.
 */
export function rollUpTestHistory(
  records,
  { lastRuns = TEST_HISTORY_RUNS, now = new Date() } = {},
) {
  const history = historyRunsOf(records, lastRuns)
  const current = currentIndexOf(history)
  return {
    schema: TEST_HISTORY_SCHEMA,
    updatedAt: now.toISOString(),
    lastRuns,
    currentRunId: history[current]?.run.id ?? null,
    runs: history.map(runLineOf),
    files: filesOf(history.map(indexRunOf), current),
  }
}
