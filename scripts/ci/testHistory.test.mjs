import { describe, expect, it } from 'vitest'
import { rollUpTestHistory } from './testHistory.mjs'
import { buildRunRecord } from './testMetrics.mjs'

const SLICE_FILE = 'src/features/ores/systems/oreTiers.test.ts'
const KERNEL_FILE = 'src/systems/economy/prices.test.ts'
const CROSS_SLICE_FILE = 'src/logging/pacingGate.test.ts'

const assertion = (title, status, duration) => ({
  fullName: `area ${title}`,
  status,
  duration,
  failureMessages: status === 'failed' ? ['boom'] : [],
})

const fileResult = (name, assertionResults, { status = 'passed', ms = 500 } = {}) => ({
  name,
  status,
  startTime: 1000,
  endTime: 1000 + ms,
  message: status === 'failed' ? 'Failed to load' : '',
  assertionResults,
})

function nightly(id, testResults, { conclusion = 'success' } = {}) {
  return buildRunRecord({
    report: testResults && { startTime: 1000, testResults },
    context: { id, mode: 'nightly', sha: `abc${id}def`, source: 'box', phase: 'nightly' },
    job: { conclusion, started_at: '2026-10-07T01:30:00Z', completed_at: '2026-10-07T01:40:00Z' },
    keepAllTests: true,
  })
}

function scoped(id, testResults) {
  return buildRunRecord({
    report: { startTime: 1000, testResults },
    context: { id, mode: 'scoped', sha: `abc${id}def`, source: 'box', phase: 'fast' },
    job: { conclusion: 'success' },
  })
}

const pricesFile = (ms, extra = []) =>
  fileResult(KERNEL_FILE, [assertion('rounds up', 'passed', ms), ...extra], { ms: ms + 10 })

describe('test history', () => {
  it('lists every test of the newest run with its duration and status in each run', () => {
    const history = rollUpTestHistory([
      nightly(2, [pricesFile(40, [assertion('later', 'skipped', 0)])]),
      nightly(1, [pricesFile(30)]),
    ])

    expect(history.runs.map((run) => run.id)).toEqual([1, 2])
    expect(history.currentRunId).toBe(2)
    expect(history.files[KERNEL_FILE].ms).toEqual([40, 50])
    expect(history.files[KERNEL_FILE].tests).toEqual({
      'area rounds up': [[30, 40], 'pp'],
      'area later': [[null, 0], '-s'],
    })
  })

  it('names the feature of each file by slice folder, cross-slice check or kernel', () => {
    const history = rollUpTestHistory([
      nightly(1, [
        pricesFile(30),
        fileResult(SLICE_FILE, [assertion('tiers', 'passed', 5)]),
        fileResult(CROSS_SLICE_FILE, [assertion('paces', 'passed', 9)]),
      ]),
    ])

    expect(history.files[SLICE_FILE]).toMatchObject({ feature: 'ores', area: 'ores' })
    expect(history.files[KERNEL_FILE]).toMatchObject({ feature: 'kernel', area: 'economy' })
    expect(history.files[CROSS_SLICE_FILE]).toMatchObject({
      feature: 'cross-slice',
      area: 'pacing-bot',
    })
  })

  it('keeps a cancelled run as trend points but lists the tests of the newest complete run', () => {
    const cancelled = nightly(3, [pricesFile(90)], { conclusion: 'cancelled' })
    const complete = nightly(2, [
      pricesFile(40),
      fileResult(SLICE_FILE, [assertion('tiers', 'passed', 5)]),
    ])

    const history = rollUpTestHistory([cancelled, complete])

    expect(history.currentRunId).toBe(2)
    expect(history.runs.map((run) => [run.id, run.isComplete])).toEqual([
      [2, true],
      [3, false],
    ])
    expect(history.files[SLICE_FILE].tests['area tiers']).toEqual([[5, null], 'p-'])
    expect(history.files[KERNEL_FILE].tests['area rounds up']).toEqual([[40, 90], 'pp'])
  })

  it('skips runs without a report and runs that kept no per-test durations', () => {
    const history = rollUpTestHistory([
      nightly(1, [pricesFile(30)]),
      nightly(2, null, { conclusion: 'failure' }),
      scoped(3, [pricesFile(70)]),
    ])

    expect(history.runs.map((run) => run.id)).toEqual([1])
    expect(history.files[KERNEL_FILE].tests['area rounds up']).toEqual([[30], 'p'])
  })

  it('drops a renamed test and starts the new name with no history', () => {
    const history = rollUpTestHistory([
      nightly(1, [fileResult(KERNEL_FILE, [assertion('rounds up', 'passed', 30)])]),
      nightly(2, [fileResult(KERNEL_FILE, [assertion('rounds prices up', 'passed', 31)])]),
    ])

    expect(Object.keys(history.files[KERNEL_FILE].tests)).toEqual(['area rounds prices up'])
    expect(history.files[KERNEL_FILE].tests['area rounds prices up']).toEqual([[null, 31], '-p'])
  })

  it('keeps the earlier tests of a file that failed to load, marked failed', () => {
    const history = rollUpTestHistory([
      nightly(1, [pricesFile(30)]),
      nightly(2, [fileResult(KERNEL_FILE, [], { status: 'failed', ms: 0 })]),
    ])

    expect(history.files[KERNEL_FILE].status).toBe('failed')
    expect(history.files[KERNEL_FILE].tests['area rounds up']).toEqual([[30, null], 'pf'])
  })

  it('keeps both rows of a test name reported twice in one file', () => {
    const twice = [assertion('row', 'passed', 1), assertion('row', 'failed', 2)]
    const history = rollUpTestHistory([nightly(1, [fileResult(KERNEL_FILE, twice)])])

    expect(history.files[KERNEL_FILE].tests).toEqual({
      'area row': [[1], 'p'],
      'area row (2)': [[2], 'f'],
    })
  })

  it('keeps only the last runs', () => {
    const records = [1, 2, 3, 4].map((id) => nightly(id, [pricesFile(id)]))

    const history = rollUpTestHistory(records, { lastRuns: 3 })

    expect(history.runs.map((run) => run.id)).toEqual([2, 3, 4])
    expect(history.files[KERNEL_FILE].tests['area rounds up'][0]).toEqual([2, 3, 4])
  })

  it('is empty when no run kept per-test durations', () => {
    const history = rollUpTestHistory([scoped(1, [pricesFile(30)])])

    expect(history).toMatchObject({ currentRunId: null, runs: [], files: {} })
  })
})
