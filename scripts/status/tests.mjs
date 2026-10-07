// The model behind the Tests tab of /status/ (#192): the test runs recorded on the orphan
// `test-metrics` branch (summary.json, docs/metrics/test-metrics.md), the box Tester's live state
// from the loop's slots.json (`tester`, docs/loop-status.md) and the box-tester/* commit statuses
// of main's tip. Since 2026-10-07 the box Tester runs every test: per spec when all its
// tickets are closed (fast relevant tests for the union of the spec's changes, then slow: pacing
// bot and e2e) and nightly (full suite and the long suites); older runs came from Actions. Pure and DOM-free: the page imports it as an ES module, build-status.mjs and the tests
// from node; the clock is passed in.

/** A box Tester that recorded nothing for this long is flagged (runs are per spec + nightly). */
export const TESTER_STALE_AFTER_H = 26
export const TEST_PHASES = ['fast', 'slow', 'full', 'nightly']
const HOUR_MS = 3_600_000
const SHOWN_RUNS = 20
const SHOWN_FILES = 8
const SHORT_SHA = 7
const STATUS_PREFIX = 'box-tester/'
const TESTER_STATES = ['idle', 'running']

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stampOrNull(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

function shaOrNull(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,40}$/.test(value) ? value : null
}

function textOrNull(value) {
  return typeof value === 'string' && value !== '' ? value : null
}

function readRun(run) {
  return {
    id: run.id ?? null,
    url: textOrNull(run.url),
    source: run.source === 'box' ? 'box' : 'actions',
    phase: textOrNull(run.phase),
    job: textOrNull(run.job),
    mode: textOrNull(run.mode),
    event: textOrNull(run.event),
    sha: shaOrNull(run.sha),
    startedAt: stampOrNull(run.startedAt),
    durationSec: Number.isFinite(run.jobDurationSec) ? run.jobDurationSec : null,
    conclusion: textOrNull(run.jobConclusion),
    timedOut: run.timedOut === true,
    reportFound: run.reportFound === true,
    files: run.files ?? 0,
    tests: run.tests ?? 0,
    failed: run.failed ?? 0,
    feature: positiveOrNull(run.feature),
    tickets: Array.isArray(run.tickets) ? run.tickets.map(positiveOrNull).filter(Boolean) : [],
  }
}

function positiveOrNull(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function readQueued(entry) {
  return {
    feature: positiveOrNull(entry?.feature),
    title: textOrNull(entry?.title),
    tickets: Array.isArray(entry?.tickets) ? entry.tickets.map(positiveOrNull).filter(Boolean) : [],
    since: stampOrNull(entry?.since),
  }
}

const newestFirst = (a, b) => Date.parse(b.startedAt ?? 0) - Date.parse(a.startedAt ?? 0)

function runsOf(summary) {
  const runs = Array.isArray(summary?.runs) ? summary.runs.filter(isObject) : []
  return runs.map(readRun).sort(newestFirst)
}

/** Latest box run per phase; for nightly every suite (job) of the newest nightly date. */
function latestByPhaseOf(boxRuns) {
  const latest = {}
  for (const phase of TEST_PHASES) latest[phase] = boxRuns.find((r) => r.phase === phase) ?? null
  return latest
}

function nightlySuitesOf(boxRuns) {
  const night = boxRuns.find((r) => r.phase === 'nightly' || r.phase === 'full')
  if (!night?.startedAt) return []
  const day = night.startedAt.slice(0, 10)
  const seen = new Set()
  return boxRuns
    .filter((r) => (r.phase === 'nightly' || r.phase === 'full') && r.startedAt?.startsWith(day))
    .filter((r) => !seen.has(r.job) && seen.add(r.job))
}

function readTester(raw) {
  if (!isObject(raw)) return null
  return {
    state: TESTER_STATES.includes(raw.state) ? raw.state : 'idle',
    phase: textOrNull(raw.phase),
    sha: shaOrNull(raw.sha),
    since: stampOrNull(raw.since),
    holdsGate: raw.holds_gate === true,
    claudeSlot: Number.isSafeInteger(raw.claude_slot) ? raw.claude_slot : null,
    lastRunAt: stampOrNull(raw.last_run),
    lastNightlyAt: stampOrNull(raw.last_nightly),
    lastNightlyResult: textOrNull(raw.last_nightly_result),
    mainRedSha: shaOrNull(raw.main_red_sha),
    feature: positiveOrNull(raw.feature),
    featureTitle: textOrNull(raw.feature_title),
    queue: (Array.isArray(raw.queue) ? raw.queue : []).map(readQueued).filter((q) => q.feature),
  }
}

function readStatuses(raw) {
  const list = Array.isArray(raw?.statuses) ? raw.statuses : []
  return list
    .filter((s) => typeof s?.context === 'string' && s.context.startsWith(STATUS_PREFIX))
    .map((s) => ({
      context: s.context,
      phase: s.context.slice(STATUS_PREFIX.length),
      state: textOrNull(s.state) ?? 'unknown',
      description: textOrNull(s.description),
      url: textOrNull(s.target_url),
      updatedAt: stampOrNull(s.updated_at),
    }))
    .sort((a, b) => TEST_PHASES.indexOf(a.phase) - TEST_PHASES.indexOf(b.phase))
}

// main's tip when the Tester has posted on it, else the newest tested commit (tip not tested yet).
function statusesShownOf(main, tested) {
  const onMain = readStatuses(main)
  const onTested = readStatuses(tested)
  const useTested = onMain.length === 0 && onTested.length > 0
  return {
    mainSha: shaOrNull(main?.sha),
    statusSha: shaOrNull((useTested ? tested : main)?.sha),
    statuses: useTested ? onTested : onMain,
    isMainTipTested: onMain.length > 0,
  }
}

function filesOf(summary) {
  const files = isObject(summary?.files) ? summary.files : {}
  return Object.entries(files)
    .filter(([, f]) => isObject(f))
    .map(([file, f]) => ({
      file,
      feature: textOrNull(f.feature),
      p95Ms: Number.isFinite(f.p95Ms) ? f.p95Ms : null,
      passRate: Number.isFinite(f.passRate) ? f.passRate : null,
      lastStatus: textOrNull(f.lastStatus),
      flaky: f.flaky === true,
    }))
}

function newestStamp(stamps) {
  const times = stamps.filter(Boolean).map(Date.parse)
  return times.length ? new Date(Math.max(...times)).toISOString() : null
}

function freshnessOf(lastBoxRun, tester, nowMs) {
  const seenAt = newestStamp([
    lastBoxRun?.startedAt,
    tester?.lastRunAt,
    tester?.state === 'running' ? tester.since : null,
  ])
  const ageH = seenAt === null ? null : Math.max(0, (nowMs - Date.parse(seenAt)) / HOUR_MS)
  return { seenAt, ageH, isStale: ageH === null || ageH > TESTER_STALE_AFTER_H }
}

/**
 * The page model. `summary` is test-metrics summary.json, `statuses` the GitHub combined status
 * of main's tip ({ sha, statuses }), `tester` the `tester` object of slots.json.
 */
export function readTestsModel({
  summary,
  statuses = null,
  testedStatuses = null,
  tester = null,
  nowMs,
}) {
  if (!isObject(summary)) return { error: 'test-metrics summary.json unavailable' }
  const runs = runsOf(summary)
  const boxRuns = runs.filter((r) => r.source === 'box')
  const files = filesOf(summary)
  const testerModel = readTester(tester)
  return {
    updatedAt: stampOrNull(summary.updatedAt),
    runs: runs.slice(0, SHOWN_RUNS),
    runCount: runs.length,
    boxRunCount: boxRuns.length,
    lastBoxRun: boxRuns[0] ?? null,
    latestByPhase: latestByPhaseOf(boxRuns),
    nightlySuites: nightlySuitesOf(boxRuns),
    tester: testerModel,
    freshness: freshnessOf(boxRuns[0], testerModel, nowMs),
    mainRedSha: testerModel?.mainRedSha ?? null,
    ...statusesShownOf(statuses, testedStatuses),
    failingFiles: files.filter((f) => f.lastStatus === 'failed').slice(0, SHOWN_FILES),
    flakyFiles: files.filter((f) => f.flaky).slice(0, SHOWN_FILES),
    slowestFiles: files
      .filter((f) => f.p95Ms !== null)
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, SHOWN_FILES),
  }
}

export const shortSha = (sha) => (sha ? sha.slice(0, SHORT_SHA) : '—')

/** Run is green: completed successfully (a phase with no test to run counts as green). */
export const isGreenRun = (run) => run?.conclusion === 'success'

/** The tab badge: `red` / `stale` / `running` / `ok`, with the class it wants. */
export function testsTabBadge(model) {
  if (model.error) return { text: '!', cls: 'bad' }
  if (model.mainRedSha) return { text: 'main red', cls: 'bad' }
  const fast = model.latestByPhase.fast
  if (fast && !isGreenRun(fast)) return { text: 'red', cls: 'bad' }
  if (model.freshness.isStale) return { text: 'stale', cls: 'warn' }
  if (model.tester?.state === 'running')
    return { text: `running ${model.tester.phase ?? ''}`.trim(), cls: '' }
  return { text: 'ok', cls: 'ok' }
}
