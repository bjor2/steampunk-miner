import { describe, expect, it } from 'vitest'
import { appendDrillLadderRows, drillLadderRowProblems } from './drillLadderHistory.mjs'

const STAMP = { recordedAt: '2026-10-16T01:40:00Z', sha: 'a'.repeat(40), phase: 'fast' }
const MEASURED_AT = '2026-10-16T01:35:00.000Z'

/** A row as src/logging/drillLadderSteps.test.ts writes it. */
const rowOf = (changes = {}) => ({
  schema: 1,
  id: `${MEASURED_AT}-drill-ladder-steps-L5`,
  measuredAt: MEASURED_AT,
  ladder: 'drill-ladder-steps',
  planet: 1,
  worldSeed: 83921,
  column: 20,
  previousLevel: 1,
  level: 5,
  cells: 20,
  ticks: 776,
  seconds: '12.933',
  cellsPerSecond: '1.546',
  gainOnPrevious: '1.024',
  lawGainOnPrevious: '1.026',
  ...changes,
})

const linesOf = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

describe('drill ladder history (ticket 434)', () => {
  it('accepts a row as the stored-step ladder writes it, also the first with no level before it', () => {
    expect(drillLadderRowProblems(rowOf())).toEqual([])
    const first = rowOf({ previousLevel: null, gainOnPrevious: null, lawGainOnPrevious: null })
    expect(drillLadderRowProblems(first)).toEqual([])
  })

  it('names every missing or malformed field of a row', () => {
    const row = rowOf({ level: '5', cellsPerSecond: 1.546, gainOnPrevious: 'fast' })
    delete row.ladder
    expect(drillLadderRowProblems(row)).toEqual([
      'ladder must be a string',
      'level must be a whole number',
      'cellsPerSecond must be decimal text',
      'gainOnPrevious must be decimal text or null',
    ])
  })

  it('appends a run once, stamped, however often the same rows are recorded', () => {
    const once = appendDrillLadderRows('', [rowOf()], STAMP)
    expect(once.added).toBe(1)
    expect(linesOf(once.text)[0]).toMatchObject({ ...STAMP, level: 5 })
    expect(appendDrillLadderRows(once.text, [rowOf()], STAMP)).toEqual({ ...once, added: 0 })
  })

  it('refuses a malformed row with its problems and keeps the others', () => {
    const bad = rowOf({ id: 'bad', ticks: 1.5 })
    const { added, refused } = appendDrillLadderRows('', [bad, rowOf()], STAMP)
    expect(added).toBe(1)
    expect(refused).toEqual([{ id: 'bad', problems: ['ticks must be a whole number'] }])
  })
})
