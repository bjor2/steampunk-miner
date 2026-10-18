import { describe, expect, it } from 'vitest'
import { appendDrillPaceRows, drillPaceRowProblems } from './drillPaceHistory.mjs'

const STAMP = { recordedAt: '2026-10-18T23:40:00Z', sha: 'a'.repeat(40), phase: 'slow' }
const MEASURED_AT = '2026-10-18T23:35:00.000Z'

/** A row as src/logging/drillPace.lane.test.ts writes it. */
const rowOf = (changes = {}) => ({
  schema: 1,
  id: `${MEASURED_AT}-drill-pace-s83921-n2`,
  measuredAt: MEASURED_AT,
  worldSeed: 83921,
  n: 2,
  d: '1.876',
  price: '2e+1',
  planet: 1,
  minute: '4.2',
  incomePerHour: '1250.000',
  isOnePlanetInterval: true,
  ...changes,
})

describe('drill pace history (ticket 552)', () => {
  it('accepts a purchase row as the lane writes it', () => {
    expect(drillPaceRowProblems(rowOf())).toEqual([])
  })

  it('names every missing or malformed field of a row', () => {
    const row = rowOf({ n: '2', price: 20, incomePerHour: 1250 })
    delete row.measuredAt
    expect(drillPaceRowProblems(row)).toEqual([
      'measuredAt must be a string',
      'n must be a whole number',
      'incomePerHour must be decimal text',
      'price must be Money text',
    ])
  })

  it('appends a run once, stamped, however often the same rows are recorded', () => {
    const once = appendDrillPaceRows('', [rowOf()], STAMP)
    expect(once.added).toBe(1)
    expect(appendDrillPaceRows(once.text, [rowOf()], STAMP)).toEqual({ ...once, added: 0 })
  })
})
