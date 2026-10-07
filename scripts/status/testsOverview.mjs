// The model of the Tests tab's test list (#192): every test of tests.json on the `test-metrics`
// branch (scripts/ci/testHistory.mjs, docs/metrics/test-metrics.md) with its feature, latest
// duration and status and its duration per run, the counts in total and per feature, the slowest
// tests, and the tests that are getting slower. Sort and filter come from the tab's hash
// (`#tests?feature=ores&q=bag&status=failed&sort=duration&dir=asc&all=1`). Pure and DOM-free: the
// page imports it as an ES module, the tests from node.

export const SORTS = ['duration', 'slowdown', 'feature', 'file', 'status']
export const STATUS_FILTERS = ['all', 'failed', 'passed', 'skipped']
export const SLOWEST_SHOWN = 10
/** Rows drawn before "show all": the full list is ~3,000 rows with a sparkline each. */
export const ROWS_SHOWN = 200
/** Getting slower: the latest run at least this times the median of the runs before it… */
export const SLOWDOWN_RATIO = 1.5
/** …and at least this many ms more, so a 2 ms test going to 4 ms does not stand out. */
export const SLOWDOWN_MIN_MS = 20
/** …over at least this many earlier runs, so one noisy run (another machine) flags nothing. */
export const SLOWDOWN_MIN_RUNS = 3

const STATUS_OF_CHAR = { p: 'passed', f: 'failed', s: 'skipped', '-': 'not run' }
const STATUS_ORDER = ['failed', 'not run', 'skipped', 'passed']
const DESCENDING_BY_DEFAULT = new Set(['duration', 'slowdown'])

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback)

/** The list's query from the hash parameters (a plain object of strings). */
export function readTestsQuery(params = {}) {
  const sort = oneOf(params.sort, SORTS, 'duration')
  const dir = params.dir === 'asc' || params.dir === 'desc' ? params.dir : null
  return {
    feature: params.feature || null,
    text: (params.q ?? '').trim(),
    status: oneOf(params.status, STATUS_FILTERS, 'all'),
    sort,
    isDescending: dir === null ? DESCENDING_BY_DEFAULT.has(sort) : dir === 'desc',
    showsAll: params.all === '1',
  }
}

/** The hash parameters of a query, defaults left out. */
export function testsQueryParams(query) {
  const params = {}
  if (query.feature) params.feature = query.feature
  if (query.text) params.q = query.text
  if (query.status !== 'all') params.status = query.status
  if (query.sort !== 'duration') params.sort = query.sort
  if (query.isDescending !== DESCENDING_BY_DEFAULT.has(query.sort))
    params.dir = query.isDescending ? 'desc' : 'asc'
  if (query.showsAll) params.all = '1'
  return params
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** `{ ratio, isSlowing }` of the value at `current` against the median of the points before it. */
function slowdownOf(trend, current) {
  const before = trend.slice(0, current).filter((ms) => ms !== null)
  const latest = trend[current]
  if (before.length < SLOWDOWN_MIN_RUNS || latest === null || latest === undefined)
    return { ratio: null, isSlowing: false }
  const baseline = median(before)
  const isSlowing = latest >= baseline * SLOWDOWN_RATIO && latest - baseline >= SLOWDOWN_MIN_MS
  return { ratio: latest / Math.max(baseline, 1), isSlowing }
}

function testRowOf(path, file, name, series, current) {
  const [trend, statuses] = series
  return {
    file: path,
    name,
    feature: file.feature,
    area: file.area,
    ms: trend[current] ?? null,
    status: STATUS_OF_CHAR[statuses[current]] ?? 'not run',
    trend,
    ...slowdownOf(trend, current),
  }
}

function rowsOf(files, current) {
  return Object.entries(files).flatMap(([path, file]) =>
    Object.entries(file.tests ?? {}).map(([name, series]) =>
      testRowOf(path, file, name, series, current),
    ),
  )
}

function countsOf(rows) {
  const counts = { files: new Set(rows.map((row) => row.file)).size, tests: rows.length }
  for (const status of ['passed', 'failed', 'skipped'])
    counts[status] = rows.filter((row) => row.status === status).length
  return counts
}

function sumTrends(trends, runCount) {
  return Array.from({ length: runCount }, (_, run) => {
    const points = trends.map((trend) => trend[run]).filter((ms) => ms !== null)
    return points.length ? points.reduce((sum, ms) => sum + ms, 0) : null
  })
}

function featureOf(feature, rows, files, runCount, current) {
  const paths = Object.keys(files).filter((path) => files[path].feature === feature)
  const trend = sumTrends(
    paths.map((path) => files[path].ms ?? []),
    runCount,
  )
  return {
    feature,
    ...countsOf(rows),
    files: paths.length,
    ms: trend[current] ?? null,
    trend,
    ...slowdownOf(trend, current),
  }
}

function featuresOf(rows, files, runCount, current) {
  const names = [...new Set(Object.values(files).map((file) => file.feature))]
  return names
    .map((name) =>
      featureOf(
        name,
        rows.filter((row) => row.feature === name),
        files,
        runCount,
        current,
      ),
    )
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0) || a.feature.localeCompare(b.feature))
}

function matchesQuery(row, query) {
  if (query.feature && row.feature !== query.feature) return false
  if (query.status !== 'all' && row.status !== query.status) return false
  const haystack = `${row.file} ${row.name} ${row.area}`.toLowerCase()
  return haystack.includes(query.text.toLowerCase())
}

const byName = (a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)

const COMPARE = {
  duration: (a, b) => (a.ms ?? -1) - (b.ms ?? -1),
  slowdown: (a, b) => (a.ratio ?? 0) - (b.ratio ?? 0),
  feature: (a, b) => a.feature.localeCompare(b.feature),
  file: () => 0,
  status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
}

function sortedRows(rows, query) {
  const sign = query.isDescending ? -1 : 1
  return [...rows].sort((a, b) => sign * (COMPARE[query.sort](a, b) || byName(a, b)))
}

function slowestOf(rows) {
  return sortedRows(rows, readTestsQuery()).slice(0, SLOWEST_SHOWN)
}

function runOf(runs, current) {
  const run = runs[current]
  return {
    id: run.id ?? null,
    url: typeof run.url === 'string' ? run.url : null,
    sha: typeof run.sha === 'string' ? run.sha : null,
    startedAt: typeof run.startedAt === 'string' ? run.startedAt : null,
    conclusion: run.conclusion ?? null,
    source: run.source ?? null,
    label: run.phase ?? run.job ?? run.mode ?? null,
  }
}

function listOf(rows, query) {
  const matching = sortedRows(
    rows.filter((row) => matchesQuery(row, query)),
    query,
  )
  return {
    rows: query.showsAll ? matching : matching.slice(0, ROWS_SHOWN),
    matchCount: matching.length,
  }
}

/** The page model of tests.json under a query from readTestsQuery. */
export function readTestsOverview(history, query = readTestsQuery()) {
  if (!isObject(history) || !Array.isArray(history.runs) || !isObject(history.files))
    return { error: 'test-metrics tests.json unavailable' }
  const current = history.runs.findIndex((run) => run.id === history.currentRunId)
  if (current < 0) return { error: 'no recorded run has kept every test yet (the nightly does)' }
  const runs = history.runs
  const rows = rowsOf(history.files, current)
  const features = featuresOf(rows, history.files, runs.length, current)
  return {
    updatedAt: history.updatedAt ?? null,
    run: runOf(runs, current),
    runs: runs.map((run) => ({ sha: run.sha ?? null, startedAt: run.startedAt ?? null })),
    counts: countsOf(rows),
    features,
    featureNames: features.map((feature) => feature.feature).sort(),
    slowest: slowestOf(rows),
    slowingCount: rows.filter((row) => row.isSlowing).length,
    query,
    ...listOf(rows, query),
  }
}
