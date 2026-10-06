import { describe, expect, it } from 'vitest'
import { benchTrendOf } from './benchTrend'
import { benchmarkData, runEventLine, sessionFilesOf } from './sessionFixtures'
import { sessionTableOf, type SessionFiles } from './sessionTable'

/** A CI bench run folder of `commit`, started on day `day` of October 2026 at `hour`. */
function benchRun(commit: string, day: number, medianUs: number, hour = 12): SessionFiles {
  const runId = `run_2026-10-${String(day).padStart(2, '0')}_${String(hour).padStart(2, '0')}-00-00_bench-world`
  const sha = commit.padEnd(40, '0')
  const line = runEventLine(runId, 0, { tick: 0, planet: 1 }, 'benchmark_result', {
    ...benchmarkData('generateChunk', medianUs, sha),
  })
  return sessionFilesOf(`ci/session-ci-${sha}-1/${runId}`, [line])
}

function trendOf(files: readonly SessionFiles[]) {
  return benchTrendOf(sessionTableOf(files).sessions)
}

describe('bench trend', () => {
  it('flags a commit more than 10% above the median of the 7 days before it', () => {
    const rows = trendOf([
      benchRun('aaaaaaa', 1, 1000),
      benchRun('bbbbbbb', 2, 1100),
      benchRun('ccccccc', 3, 1000),
      benchRun('ddddddd', 4, 1150),
    ])
    const last = rows.at(-1)
    expect(last).toMatchObject({
      series: 'generateChunk p1',
      source: 'ci',
      commit: 'ddddddd',
      baselineUs: 1000,
      baselineCommits: 3,
      isRegression: true,
    })
    expect(last?.changePercent).toBeCloseTo(15)
  })

  it('does not flag a change of exactly 10%', () => {
    const rows = trendOf([benchRun('aaaaaaa', 1, 1000), benchRun('bbbbbbb', 2, 1100)])
    expect(rows[1]).toMatchObject({ changePercent: 10, isRegression: false })
  })

  it('leaves commits measured more than 7 days earlier out of the baseline', () => {
    const rows = trendOf([benchRun('aaaaaaa', 1, 500), benchRun('bbbbbbb', 9, 1000)])
    expect(rows[1]).toMatchObject({ baselineUs: null, changePercent: null, isRegression: false })
  })

  it('reads several runs of one commit as their median', () => {
    const rows = trendOf([
      benchRun('aaaaaaa', 1, 900, 10),
      benchRun('aaaaaaa', 1, 1000, 11),
      benchRun('aaaaaaa', 1, 4000, 12),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ results: 3, medianUs: 1000, p95Us: 2000 })
  })

  it('never mixes a CI runner with the box', () => {
    const local = { ...benchRun('bbbbbbb', 2, 5000), folder: 'logs/run_bench-world' }
    const rows = trendOf([benchRun('aaaaaaa', 1, 1000), local])
    expect(rows.map((row) => [row.source, row.baselineUs])).toEqual([
      ['ci', null],
      ['local', null],
    ])
  })
})
