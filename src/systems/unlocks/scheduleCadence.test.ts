import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LAST_PLANET, MAX_PLANETS_WITHOUT_HORIZONTAL } from '../../constants/balance'
import type { UnlockSchedule } from './readUnlockSchedule'
import { longestRunWithoutHorizontal } from './scheduleCadence'
import { LOCKED_SCHEDULE } from './unlockSchedule'

function withoutRowsOn(schedule: UnlockSchedule, planets: readonly number[]): UnlockSchedule {
  return { ...schedule, rows: schedule.rows.filter((row) => !planets.includes(row.planetIndex)) }
}

describe('schedule cadence', () => {
  it('keeps the locked table within #81: no more than 2 campaign planets without a horizontal', () => {
    expect(longestRunWithoutHorizontal(LOCKED_SCHEDULE, CAMPAIGN_LAST_PLANET)).toBeLessThanOrEqual(
      MAX_PLANETS_WITHOUT_HORIZONTAL,
    )
  })

  it('finds the locked worst run of 1 empty planet (#80: P16 and P29)', () => {
    expect(longestRunWithoutHorizontal(LOCKED_SCHEDULE, CAMPAIGN_LAST_PLANET)).toBe(1)
  })

  it('reports a table mutated to leave planets 15 to 17 empty as over the cap', () => {
    const mutated = withoutRowsOn(LOCKED_SCHEDULE, [15, 17])
    expect(longestRunWithoutHorizontal(mutated, CAMPAIGN_LAST_PLANET)).toBe(3)
    expect(longestRunWithoutHorizontal(mutated, CAMPAIGN_LAST_PLANET)).toBeGreaterThan(
      MAX_PLANETS_WITHOUT_HORIZONTAL,
    )
  })

  it('does not count cut or vertical rows as a horizontal', () => {
    const mutated: UnlockSchedule = {
      ...LOCKED_SCHEDULE,
      rows: LOCKED_SCHEDULE.rows.map((row) => {
        if (row.planetIndex === 15) return { ...row, status: 'cut' }
        if (row.planetIndex === 17) return { ...row, progressionAxis: 'vertical' }
        return row
      }),
    }
    expect(longestRunWithoutHorizontal(mutated, CAMPAIGN_LAST_PLANET)).toBe(3)
  })

  it('counts a run that reaches the last campaign planet', () => {
    const mutated = withoutRowsOn(LOCKED_SCHEDULE, [38, 39, 40])
    expect(longestRunWithoutHorizontal(mutated, CAMPAIGN_LAST_PLANET)).toBe(3)
  })
})
