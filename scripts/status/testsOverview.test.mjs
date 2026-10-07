import { describe, expect, it } from 'vitest'
import {
  ROWS_SHOWN,
  SLOWEST_SHOWN,
  readTestsOverview,
  readTestsQuery,
  testsQueryParams,
} from './testsOverview.mjs'

const SHA = 'e8d776b6afdbe7cb411fcea37d2753ba1dae2ddf'
const ORES = 'src/features/ores/systems/oreTiers.test.ts'
const PRICES = 'src/systems/economy/prices.test.ts'

const runLine = (id, over = {}) => ({
  id,
  url: `https://github.com/o/r/commit/${SHA}`,
  sha: SHA,
  startedAt: '2026-10-07T01:30:00Z',
  source: 'box',
  phase: 'nightly',
  job: 'full',
  mode: 'nightly',
  conclusion: 'success',
  timedOut: false,
  isComplete: true,
  ...over,
})

function history(over = {}) {
  return {
    schema: 1,
    updatedAt: '2026-10-07T02:00:00Z',
    lastRuns: 20,
    currentRunId: 4,
    runs: [runLine(1), runLine(2), runLine(3), runLine(4)],
    files: {
      [ORES]: {
        feature: 'ores',
        area: 'ores',
        status: 'passed',
        ms: [100, 105, 110, 400],
        tests: {
          'ore tiers sell one tier up': [[10, 10, 10, 300], 'pppp'],
          'ore tiers drill at H(t+5)': [[5, 6, 6, 6], 'pppf'],
        },
      },
      [PRICES]: {
        feature: 'kernel',
        area: 'economy',
        status: 'passed',
        ms: [50, null, 55, 60],
        tests: {
          'prices round up': [[40, null, 40, 41], 'p-pp'],
          'prices later': [[0, null, 0, 0], 's-ss'],
        },
      },
    },
    ...over,
  }
}

const namesOf = (rows) => rows.map((row) => row.name)

describe('tests overview', () => {
  it('lists every test of the current run with its feature, status, duration and trend', () => {
    const model = readTestsOverview(history())

    expect(model.run).toMatchObject({ id: 4, sha: SHA, label: 'nightly', conclusion: 'success' })
    expect(model.rows).toContainEqual(
      expect.objectContaining({
        file: PRICES,
        name: 'prices round up',
        feature: 'kernel',
        area: 'economy',
        status: 'passed',
        ms: 41,
        trend: [40, null, 40, 41],
      }),
    )
  })

  it('counts files and tests with passed, failed and skipped in the current run', () => {
    const model = readTestsOverview(history())

    expect(model.counts).toEqual({ files: 2, tests: 4, passed: 2, failed: 1, skipped: 1 })
  })

  it('totals each feature per run from its files, heaviest feature first', () => {
    const model = readTestsOverview(history())

    expect(model.features.map((f) => [f.feature, f.files, f.tests, f.ms, f.trend])).toEqual([
      ['ores', 1, 2, 400, [100, 105, 110, 400]],
      ['kernel', 1, 2, 60, [50, null, 55, 60]],
    ])
  })

  it('flags a test well over the median of its earlier runs as getting slower', () => {
    const model = readTestsOverview(history())
    const slowing = model.rows.filter((row) => row.isSlowing)

    expect(namesOf(slowing)).toEqual(['ore tiers sell one tier up'])
    expect(model.slowingCount).toBe(1)
    expect(model.features.find((f) => f.feature === 'ores').isSlowing).toBe(true)
  })

  it('does not flag a few ms on a tiny test or a test with under three earlier runs', () => {
    const files = {
      [PRICES]: {
        ...history().files[PRICES],
        tests: {
          tiny: [[2, 3, 3, 9], 'pppp'],
          young: [[null, 10, 10, 300], '-ppp'],
          fresh: [[null, null, null, 900], '---p'],
        },
      },
    }
    const model = readTestsOverview(history({ files }))

    expect(model.rows.filter((row) => row.isSlowing)).toEqual([])
  })

  it('sorts by duration, slowest first, by default and keeps the slowest few', () => {
    const model = readTestsOverview(history())

    expect(namesOf(model.rows)).toEqual([
      'ore tiers sell one tier up',
      'prices round up',
      'ore tiers drill at H(t+5)',
      'prices later',
    ])
    expect(model.slowest.length).toBeLessThanOrEqual(SLOWEST_SHOWN)
    expect(model.slowest[0].name).toBe('ore tiers sell one tier up')
  })

  it('filters by feature, status and text, and sorts by status with failures first', () => {
    const byFeature = readTestsOverview(history(), readTestsQuery({ feature: 'kernel' }))
    const byStatus = readTestsOverview(history(), readTestsQuery({ status: 'failed' }))
    const byText = readTestsOverview(history(), readTestsQuery({ q: 'ECONOMY' }))
    const byStatusSort = readTestsOverview(history(), readTestsQuery({ sort: 'status' }))

    expect(namesOf(byFeature.rows)).toEqual(['prices round up', 'prices later'])
    expect(namesOf(byStatus.rows)).toEqual(['ore tiers drill at H(t+5)'])
    expect(byText.matchCount).toBe(2)
    expect(byStatusSort.rows[0].status).toBe('failed')
  })

  it('shows the first rows until asked for all', () => {
    const tests = Object.fromEntries(
      Array.from({ length: ROWS_SHOWN + 5 }, (_, i) => [`test ${i}`, [[i, i, i, i], 'pppp']]),
    )
    const files = { [PRICES]: { ...history().files[PRICES], tests } }

    const first = readTestsOverview(history({ files }))
    const all = readTestsOverview(history({ files }), readTestsQuery({ all: '1' }))

    expect([first.rows.length, first.matchCount]).toEqual([ROWS_SHOWN, ROWS_SHOWN + 5])
    expect(all.rows.length).toBe(ROWS_SHOWN + 5)
  })

  it('reads the current run even when a newer cancelled run follows it', () => {
    const runs = [
      runLine(1),
      runLine(2),
      runLine(3, { conclusion: 'cancelled', isComplete: false }),
    ]
    const model = readTestsOverview(history({ runs, currentRunId: 2 }))

    expect(model.run.id).toBe(2)
    expect(model.rows.find((row) => row.name === 'prices round up')).toMatchObject({
      ms: null,
      status: 'not run',
    })
  })

  it('reports a missing file or one with no run as an error', () => {
    expect(readTestsOverview(null).error).toMatch(/unavailable/)
    expect(readTestsOverview(history({ runs: [], currentRunId: null })).error).toMatch(/nightly/)
  })

  it('round-trips a query through the hash parameters, leaving defaults out', () => {
    const query = readTestsQuery({ feature: 'ores', q: 'tier', sort: 'file', dir: 'desc' })

    expect(testsQueryParams(query)).toEqual({
      feature: 'ores',
      q: 'tier',
      sort: 'file',
      dir: 'desc',
    })
    expect(testsQueryParams(readTestsQuery({}))).toEqual({})
    expect(readTestsQuery({ sort: 'nonsense', status: 'nope' })).toMatchObject({
      sort: 'duration',
      status: 'all',
      isDescending: true,
    })
  })
})
