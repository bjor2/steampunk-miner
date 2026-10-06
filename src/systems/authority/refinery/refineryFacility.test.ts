import { describe, expect, it } from 'vitest'
import { refineryUnlockPlanet } from '../../economy/refineryEconomy'
import { BUILT_VISION_ROW_IDS, LOCKED_SCHEDULE } from '../../unlocks/unlockSchedule'
import { builtFacilityRowIdsOn, hasRefineryOn, REFINERY_BAY_ROW_ID } from './refineryFacility'

describe('refinery facility', () => {
  it('builds the refinery_bay schedule row as a facility at the economy unlock planet', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === REFINERY_BAY_ROW_ID)
    expect(row).toMatchObject({ bind: 'facility', lane: 'Facility' })
    expect(BUILT_VISION_ROW_IDS.has(REFINERY_BAY_ROW_ID)).toBe(true)
    expect(row?.planetIndex).toBe(refineryUnlockPlanet())
  })

  it('has the bay from planet 3 on and none before', () => {
    expect([1, 2, 3, 4, 40].map(hasRefineryOn)).toEqual([false, false, true, true, true])
  })

  it('builds the refinery_bay facility row from planet 3', () => {
    expect([...builtFacilityRowIdsOn(2)]).toEqual([])
    expect([...builtFacilityRowIdsOn(3)]).toEqual(['refinery_bay'])
  })
})
