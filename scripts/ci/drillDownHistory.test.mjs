import { describe, expect, it } from 'vitest'
import { appendDrillDownRows, drillDownRowProblems } from './drillDownHistory.mjs'

const STAMP = { recordedAt: '2026-10-16T01:40:00Z', sha: 'a'.repeat(40), phase: 'nightly' }

/** A row as e2e/browser/drillDown.spec.ts writes it. */
const rowOf = (changes = {}) => ({
  schema: 1,
  id: '2026-10-16T01:35:00.000Z-L1',
  measuredAt: '2026-10-16T01:35:00.000Z',
  buildCommit: 'e1b25a23',
  seed: 83921,
  planet: 1,
  drillLevel: 1,
  holdMs: 10004,
  ticks: 600,
  start: { x: 16.42, y: 299.61, depthTiles: 0 },
  end: { x: 16.4, y: 287.1, depthTiles: 12 },
  depthGainedTiles: 12,
  descentMetres: 12.51,
  cellsPerSecond: 1.2,
  speedMetresPerSecond: 1.251,
  ...changes,
})

const linesOf = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

describe('drill-down history (ticket 416)', () => {
  it('accepts a row as the browser run writes it', () => {
    expect(drillDownRowProblems(rowOf())).toEqual([])
  })

  it('names every missing or malformed field of a row', () => {
    const row = rowOf({ drillLevel: 'one', end: { x: 1, y: 2 } })
    delete row.buildCommit
    expect(drillDownRowProblems(row)).toEqual([
      'buildCommit must be a string',
      'drillLevel must be a whole number',
      'end.depthTiles must be a number',
    ])
  })

  it('appends each new row as one stamped line after the history it keeps', () => {
    const earlier = `${JSON.stringify(rowOf({ id: 'old' }))}\n`
    const { text, added } = appendDrillDownRows(earlier, [rowOf()], STAMP)
    expect(added).toBe(1)
    expect(linesOf(text).map((row) => row.id)).toEqual(['old', rowOf().id])
    expect(linesOf(text)[1]).toMatchObject({ ...STAMP, depthGainedTiles: 12 })
  })

  it('appends a row it already holds only once, so a second record of the same run is a no-op', () => {
    const once = appendDrillDownRows('', [rowOf()], STAMP).text
    const twice = appendDrillDownRows(once, [rowOf()], STAMP)
    expect(twice).toEqual({ text: once, added: 0, refused: [] })
  })

  it('refuses a malformed row with its problems and keeps the others', () => {
    const { text, added, refused } = appendDrillDownRows(
      '',
      [rowOf({ id: 'bad', holdMs: null }), rowOf()],
      STAMP,
    )
    expect(added).toBe(1)
    expect(refused).toEqual([{ id: 'bad', problems: ['holdMs must be a number'] }])
    expect(linesOf(text).map((row) => row.id)).toEqual([rowOf().id])
  })

  it('appends in measured order, so the file reads oldest first', () => {
    const later = rowOf({ id: 'L10', measuredAt: '2026-10-16T01:36:00.000Z', drillLevel: 10 })
    const { text } = appendDrillDownRows('', [later, rowOf()], STAMP)
    expect(linesOf(text).map((row) => row.drillLevel)).toEqual([1, 10])
  })
})
