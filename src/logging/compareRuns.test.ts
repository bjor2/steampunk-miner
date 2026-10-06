import { describe, expect, it } from 'vitest'
import {
  compareRuns,
  compareRunsIncludingDebug,
  formatComparisonTable,
  type ComparisonRow,
} from './compareRuns'
import { deriveSummary, type RunSummary } from './runSummary'

const MINUTE = 3600

function summaryOf(overrides: Partial<RunSummary> = {}): RunSummary {
  return { ...deriveSummary([]), runId: 'run_a', durationTicks: 10 * MINUTE, ...overrides }
}

const rowNamed = (rows: ComparisonRow[], metric: string) =>
  rows.find((row) => row.metric === metric)

describe('compareRuns', () => {
  it('reports no change between a run and itself', () => {
    const comparison = compareRuns(summaryOf(), summaryOf())
    expect(comparison.ok).toBe(true)
    if (!comparison.ok) return
    expect(rowNamed(comparison.rows, 'run length')).toEqual({
      metric: 'run length',
      a: '10.0 min',
      b: '10.0 min',
      change: '+0.0 min (+0%)',
    })
  })

  it('reports a slower core as minutes and a share, not as a failure', () => {
    const a = summaryOf({ coreCompletedTicks: { '1': 40 * MINUTE } })
    const b = summaryOf({ runId: 'run_b', coreCompletedTicks: { '1': 50 * MINUTE } })
    const comparison = compareRuns(a, b)
    expect(comparison.ok && rowNamed(comparison.rows, 'planet 1 core completed')).toEqual({
      metric: 'planet 1 core completed',
      a: '40.0 min',
      b: '50.0 min',
      change: '+10.0 min (+25%)',
    })
  })

  it('compares money exactly past 1e40 and income per minute', () => {
    const a = summaryOf({ moneyEarned: '2e+41' })
    const b = summaryOf({ runId: 'run_b', moneyEarned: '1e+41' })
    const comparison = compareRuns(a, b)
    expect(comparison.ok && rowNamed(comparison.rows, 'money earned')?.change).toBe(
      '-1.00e41 (-50%)',
    )
    expect(comparison.ok && rowNamed(comparison.rows, 'income per minute')?.a).toBe('2.00e40')
  })

  it('shows lining paid next to lining charged, so an unpaid share is visible', () => {
    const a = summaryOf({ liningSpending: '0e+0', liningCharged: '0e+0' })
    const b = summaryOf({ runId: 'run_b', liningSpending: '4e+2', liningCharged: '5e+2' })
    const comparison = compareRuns(a, b)
    expect(comparison.ok && rowNamed(comparison.rows, 'spent on lining')?.b).toBe('400')
    expect(comparison.ok && rowNamed(comparison.rows, 'lining charged')?.b).toBe('500')
  })

  it('lists the final level of every track either run has', () => {
    const a = summaryOf({ upgradeLevels: { drill_power: 28 } })
    const b = summaryOf({ runId: 'run_b', upgradeLevels: { drill_power: 19, hull: 3 } })
    const comparison = compareRuns(a, b)
    expect(comparison.ok && rowNamed(comparison.rows, 'drill_power level')?.change).toBe('-9')
    expect(comparison.ok && rowNamed(comparison.rows, 'hull level')?.change).toBe('+3')
  })

  it('refuses runs logged under different schema versions', () => {
    const comparison = compareRunsIncludingDebug(summaryOf(), summaryOf({ logSchemaVersion: 2 }))
    expect(comparison).toEqual({
      ok: false,
      problems: ['run_a has logSchemaVersion 1 and run_a has 2; no adapter exists between them'],
    })
  })

  it('refuses a run that applied debug commands unless asked to include it', () => {
    const debugRun = summaryOf({ runId: 'run_debug', debugCommandsApplied: 3 })
    expect(compareRuns(summaryOf(), debugRun)).toEqual({
      ok: false,
      problems: ['run_debug applied 3 debug commands'],
    })
    expect(compareRunsIncludingDebug(summaryOf(), debugRun).ok).toBe(true)
  })

  it('prints a Markdown table headed by the two labels', () => {
    const table = formatComparisonTable(
      [{ metric: 'vehicle deaths', a: '1', b: '3', change: '+2' }],
      ['baseline', 'this build'],
    )
    expect(table).toBe(
      '| metric | baseline | this build | change |\n| --- | --- | --- | --- |\n' +
        '| vehicle deaths | 1 | 3 | +2 |',
    )
  })
})
