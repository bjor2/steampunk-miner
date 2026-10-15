import { describe, expect, it } from 'vitest'
import { DRILL_DOWN_HISTORY_ROWS, readDrillDownRuns } from './drillDown.mjs'
import { depthTrendSvg, renderDrillDown, renderDrillDownFailure } from './drillDownHtml.mjs'

const VIEW = { repo: 'o/r', nowMs: Date.parse('2026-10-16T08:00:00Z') }

/** A history line as scripts/ci/recordDrillDown.mjs appends it. */
const runOf = (minute, drillLevel, depthGainedTiles, buildCommit = `c${minute}`) => ({
  schema: 1,
  id: `m${minute}-L${drillLevel}`,
  measuredAt: `2026-10-16T01:${String(minute).padStart(2, '0')}:00.000Z`,
  buildCommit,
  seed: 83921,
  planet: 1,
  drillLevel,
  holdMs: 10004,
  ticks: 600,
  start: { x: 16.4, y: 299.6, depthTiles: 0 },
  end: { x: 16.4, y: 299.6 - depthGainedTiles, depthTiles: depthGainedTiles },
  depthGainedTiles,
  descentMetres: depthGainedTiles,
  cellsPerSecond: depthGainedTiles / 10,
  speedMetresPerSecond: depthGainedTiles / 10,
  recordedAt: '2026-10-16T01:40:00Z',
  sha: `${buildCommit}${'0'.repeat(32)}`,
  phase: 'nightly',
})

const ndjsonOf = (rows) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n'

describe('drill-down panel model (ticket 416)', () => {
  it('shows the latest run of each drill level with the one before it', () => {
    const model = readDrillDownRuns(
      ndjsonOf([runOf(1, 1, 8), runOf(2, 10, 30), runOf(3, 1, 9), runOf(4, 10, 33)]),
    )
    expect(model.levels.map((level) => [level.level, level.latest.depthGainedTiles])).toEqual([
      [1, 9],
      [10, 33],
    ])
    expect(model.levels[0].previous.depthGainedTiles).toBe(8)
  })

  it('traces each level over commits, oldest first, whatever order the lines are in', () => {
    const model = readDrillDownRuns(ndjsonOf([runOf(3, 1, 9), runOf(1, 1, 8), runOf(2, 1, 12)]))
    expect(model.levels[0].trend).toEqual([
      { commit: 'c1', measuredAt: runOf(1, 1, 8).measuredAt, value: 8 },
      { commit: 'c2', measuredAt: runOf(2, 1, 12).measuredAt, value: 12 },
      { commit: 'c3', measuredAt: runOf(3, 1, 9).measuredAt, value: 9 },
    ])
  })

  it('lists the newest runs first, at most the history length', () => {
    const rows = Array.from({ length: DRILL_DOWN_HISTORY_ROWS + 5 }, (_, i) => runOf(i, 1, i))
    const model = readDrillDownRuns(ndjsonOf(rows))
    expect(model.runCount).toBe(DRILL_DOWN_HISTORY_ROWS + 5)
    expect(model.history).toHaveLength(DRILL_DOWN_HISTORY_ROWS)
    expect(model.history[0].depthGainedTiles).toBe(DRILL_DOWN_HISTORY_ROWS + 4)
  })

  it('skips torn lines and counts them', () => {
    const model = readDrillDownRuns(`${ndjsonOf([runOf(1, 1, 8)])}{"torn\n{}\n`)
    expect(model.runCount).toBe(1)
    expect(model.skipped).toBe(2)
  })

  it('says so when no run is recorded yet', () => {
    expect(readDrillDownRuns('')).toEqual({ error: 'no drill-down run recorded yet' })
    expect(readDrillDownRuns(null)).toEqual({ error: 'no drill-down run recorded yet' })
  })
})

describe('drill-down panel drawing (ticket 416)', () => {
  it('draws the start, end, depth reached and its change against the run before', () => {
    const model = readDrillDownRuns(ndjsonOf([runOf(1, 1, 8), runOf(3, 1, 11, 'abc1234')]))
    const html = renderDrillDown(model, VIEW)
    expect(html).toContain('(16.4, 299.6) · 0 deep')
    expect(html).toContain('(16.4, 288.6) · 11 deep')
    expect(html).toContain('<b>11</b> cells')
    expect(html).toContain('(+3)')
    expect(html).toContain(`href="https://github.com/o/r/commit/abc1234${'0'.repeat(32)}"`)
  })

  it('draws a lone run as a dot and a trend as a line', () => {
    expect(depthTrendSvg([{ commit: 'c1', value: 8 }])).toContain('<circle')
    const line = depthTrendSvg([
      { commit: 'c1', value: 8 },
      { commit: 'c2', value: 12 },
    ])
    expect(line).toContain('<polyline points="2,6.7 88,2"/>')
    expect(line).toContain('c1: 8 cells\nc2: 12 cells')
  })

  it('names the missing history instead of a table', () => {
    const html = renderDrillDownFailure('no drill-down run recorded yet', VIEW)
    expect(html).toContain('No runs to show: no drill-down run recorded yet')
    expect(html).not.toContain('<table')
  })
})
