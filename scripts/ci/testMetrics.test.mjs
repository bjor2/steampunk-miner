import { describe, expect, it } from 'vitest'
import { featureOfTestFile, UNMAPPED_FEATURE } from './testFeatures.mjs'
import { buildRunRecord, percentile, relativeTestPath, rollUpSummary } from './testMetrics.mjs'

const ROOT = '/home/runner/work/steampunk-miner/steampunk-miner'

const assertion = (title, status, duration, failureMessages = []) => ({
  ancestorTitles: ['area'],
  fullName: `area ${title}`,
  title,
  status,
  duration,
  failureMessages,
})

const fileResult = (path, status, startTime, endTime, assertionResults) => ({
  name: `${ROOT}/${path}`,
  status,
  startTime,
  endTime,
  message: '',
  assertionResults,
})

const REPORT = {
  startTime: 1000,
  testResults: [
    fileResult('src/systems/economy/prices.test.ts', 'passed', 1100, 1600, [
      assertion('rounds up', 'passed', 300.4),
      assertion('rounds down', 'passed', 100),
      assertion('later', 'skipped', 0),
    ]),
    fileResult('src/systems/bot/botRefining.test.ts', 'failed', 1000, 4000, [
      assertion('refines ore', 'failed', 2900, ['AssertionError: expected 1 to be 2\n at x']),
    ]),
  ],
}

const CONTEXT = { id: 100, mode: 'scoped', sha: 'abc1234', event: 'push', timeoutMinutes: 10 }

const JOB = {
  name: 'verify',
  conclusion: 'success',
  started_at: '2026-10-06T19:00:00Z',
  completed_at: '2026-10-06T19:02:30Z',
  steps: [
    {
      name: 'Run npm ci',
      conclusion: 'success',
      started_at: '2026-10-06T19:00:05Z',
      completed_at: '2026-10-06T19:00:12Z',
    },
  ],
}

const runOf = (id, mode, sha, files) => ({
  schema: 1,
  run: {
    id,
    mode,
    sha,
    startedAt: `2026-10-06T19:${String(id % 60).padStart(2, '0')}:00Z`,
    timedOut: false,
  },
  totals: {
    reportFound: true,
    files: files.length,
    tests: files.length,
    failed: 0,
    failedFiles: 0,
  },
  files: files.map(([file, status, durationMs]) => ({
    file,
    feature: featureOfTestFile(file),
    status,
    durationMs,
    slowest: [],
    failures: status === 'failed' ? [{ test: 'area it breaks', message: 'boom' }] : [],
  })),
})

describe('test feature mapping', () => {
  it('maps slices, systems folders, layers and the pacing bot, and leaves the rest unmapped', () => {
    expect(featureOfTestFile('src/features/dynamite/systems/fuse.test.ts')).toBe('dynamite')
    expect(featureOfTestFile('src/systems/economy/prices.test.ts')).toBe('economy')
    expect(featureOfTestFile('src/systems/seededRandom.test.ts')).toBe('systems-core')
    expect(featureOfTestFile('src/store/gameStore.test.ts')).toBe('store')
    expect(featureOfTestFile('src/logging/pacingGate.test.ts')).toBe('pacing-bot')
    expect(featureOfTestFile('src/systems/bot/playSlice.test.ts')).toBe('pacing-bot')
    expect(featureOfTestFile('src/logging/goldenRun.test.ts')).toBe('golden-replay')
    expect(featureOfTestFile('scripts/status/features.test.mjs')).toBe('tooling-status')
    expect(featureOfTestFile('src/bootstrap.test.ts')).toBe(UNMAPPED_FEATURE)
  })
})

describe('test run record', () => {
  it('reads repo-relative paths under the root, or from the first known folder', () => {
    expect(relativeTestPath(`${ROOT}/src/a.test.ts`, ROOT)).toBe('src/a.test.ts')
    expect(relativeTestPath('D:\\a\\repo\\scripts\\x.test.mjs')).toBe('scripts/x.test.mjs')
  })

  it('keeps per-file duration, counts, slowest tests and failures, grouped by feature', () => {
    const record = buildRunRecord({ report: REPORT, context: CONTEXT, job: JOB, root: ROOT })
    const prices = record.files.find((file) => file.feature === 'economy')
    expect(prices).toMatchObject({
      status: 'passed',
      durationMs: 500,
      tests: 3,
      passed: 2,
      skipped: 1,
    })
    expect(prices.slowest).toEqual([
      ['area rounds up', 300],
      ['area rounds down', 100],
    ])
    expect(prices.testDurations).toBeUndefined()
    const bot = record.files.find((file) => file.feature === 'bot')
    expect(bot.failures).toEqual([
      { test: 'area refines ore', message: expect.stringContaining('expected 1 to be 2') },
    ])
    expect(record.features.bot).toEqual({
      files: 1,
      tests: 1,
      failed: 1,
      skipped: 0,
      durationMs: 3000,
    })
    expect(record.totals).toMatchObject({
      reportFound: true,
      files: 2,
      failedFiles: 1,
      tests: 4,
      wallMs: 3000,
    })
    expect(record.run).toMatchObject({
      jobDurationSec: 150,
      jobConclusion: 'success',
      timedOut: false,
    })
    expect(record.steps).toEqual([{ name: 'Run npm ci', conclusion: 'success', durationSec: 7 }])
  })

  it('records every test when asked, as the nightly run does', () => {
    const record = buildRunRecord({
      report: REPORT,
      context: CONTEXT,
      root: ROOT,
      keepAllTests: true,
    })
    expect(record.files[1].testDurations).toContainEqual(['area later', 0, 'skipped'])
  })

  it('records a run cancelled at its timeout with no report', () => {
    const cancelled = { ...JOB, conclusion: 'cancelled', completed_at: '2026-10-06T19:10:20Z' }
    const record = buildRunRecord({ report: null, context: CONTEXT, job: cancelled })
    expect(record.files).toEqual([])
    expect(record.totals).toMatchObject({ reportFound: false, files: 0, wallMs: null })
    expect(record.run).toMatchObject({
      jobConclusion: 'cancelled',
      timedOut: true,
      jobDurationSec: 620,
    })
  })

  it('does not call an early manual cancel a timeout', () => {
    const cancelled = { ...JOB, conclusion: 'cancelled' }
    expect(buildRunRecord({ report: null, context: CONTEXT, job: cancelled }).run.timedOut).toBe(
      false,
    )
  })
})

describe('test metrics summary', () => {
  it('takes the nearest-rank percentile', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100)
    expect(percentile([], 50)).toBeNull()
  })

  it('rolls files and features up over the last runs, with pass rate and last failure', () => {
    const summary = rollUpSummary(
      [
        runOf(3, 'scoped', 'c3', [['src/systems/economy/a.test.ts', 'failed', 300]]),
        runOf(1, 'full', 'c1', [
          ['src/systems/economy/a.test.ts', 'passed', 100],
          ['src/store/s.test.ts', 'passed', 50],
        ]),
        runOf(2, 'scoped', 'c2', [['src/systems/economy/a.test.ts', 'passed', 200]]),
      ],
      { lastRuns: 50, now: new Date('2026-10-06T20:00:00Z') },
    )
    expect(summary.runs.map((run) => run.id)).toEqual([1, 2, 3])
    expect(summary.files['src/systems/economy/a.test.ts']).toMatchObject({
      feature: 'economy',
      runs: 3,
      p50Ms: 200,
      p95Ms: 300,
      lastMs: 300,
      lastStatus: 'failed',
      lastFailure: { runId: 3, sha: 'c3', tests: ['area it breaks'] },
      flaky: false,
    })
    expect(summary.files['src/systems/economy/a.test.ts'].passRate).toBeCloseTo(2 / 3)
    expect(summary.features.economy).toMatchObject({
      files: 1,
      p50Ms: 200,
      fileRuns: 3,
      failedFileRuns: 1,
    })
    expect(summary.features.store.passRate).toBe(1)
    expect(summary.pipeline.modes).toEqual({ full: 1, scoped: 2 })
  })

  it('keeps only the last runs', () => {
    const runs = [1, 2, 3].map((id) =>
      runOf(id, 'scoped', `c${id}`, [['src/store/s.test.ts', 'passed', id]]),
    )
    expect(rollUpSummary(runs, { lastRuns: 2 }).files['src/store/s.test.ts'].runs).toBe(2)
  })

  it('marks a file flaky when one commit both passed and failed it', () => {
    const summary = rollUpSummary([
      runOf(1, 'scoped', 'same', [['src/store/s.test.ts', 'failed', 10]]),
      runOf(2, 'scoped', 'same', [['src/store/s.test.ts', 'passed', 10]]),
    ])
    expect(summary.files['src/store/s.test.ts'].flaky).toBe(true)
  })

  it('names nightly failures that the per-push runs since the last nightly passed or skipped', () => {
    const summary = rollUpSummary([
      runOf(1, 'nightly', 'n1', [['src/store/s.test.ts', 'passed', 10]]),
      runOf(2, 'scoped', 'c2', [['src/store/s.test.ts', 'passed', 10]]),
      runOf(3, 'nightly', 'n3', [
        ['src/store/s.test.ts', 'failed', 10],
        ['src/logging/pacingGate.test.ts', 'failed', 10],
      ]),
    ])
    expect(summary.pipeline.scopingSuspects).toEqual([
      { file: 'src/store/s.test.ts', nightlyRunId: 3, lastPerPushStatus: 'passed' },
      { file: 'src/logging/pacingGate.test.ts', nightlyRunId: 3, lastPerPushStatus: null },
    ])
  })
})
