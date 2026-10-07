import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { UnlockRow, UnlockSchedule } from '../unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { builtFacilityRowIdsOn } from './builtFacilities'
import { featureUnlocksOfTravelIn } from './featureUnlocks'

// A slice stamps a dock building through the dock-building registry (#221); a fake slice
// registers one through withRegistrations, so no real slice is imported.

const LAB_PROBE: SliceDefinition = {
  id: 'lab-probe',
  register: (r) => r.dockFacility({ id: 'lab-probe.annex', scheduleRowId: 'research_lab' }),
}

/** The locked schedule with `rowId` at `status`: shipped as #222 flipped it, or still vision. */
function scheduleWithStatus(rowId: string, status: UnlockRow['status']): UnlockSchedule {
  return {
    ...LOCKED_SCHEDULE,
    rows: LOCKED_SCHEDULE.rows.map((row) => (row.id === rowId ? { ...row, status } : row)),
  }
}

const scheduleWithShipped = (rowId: string) => scheduleWithStatus(rowId, 'shipped')

const builtRowsOn = (slices: readonly SliceDefinition[], planetIndex: number) =>
  withRegistrations(slices, () => [...builtFacilityRowIdsOn(planetIndex)])

describe('built facilities', () => {
  it('builds only the refinery_bay row, from planet 3, when no dock building is registered', () => {
    expect([2, 3, 15, 20].map((planet) => builtRowsOn([], planet))).toEqual([
      [],
      ['refinery_bay'],
      ['refinery_bay'],
      ['refinery_bay'],
    ])
  })

  it('builds a registered dock building from its schedule row planet on', () => {
    expect(builtRowsOn([LAB_PROBE], 14)).toEqual(['refinery_bay'])
    expect(builtRowsOn([LAB_PROBE], 15)).toEqual(['refinery_bay', 'research_lab'])
    expect(builtRowsOn([LAB_PROBE], 40)).toEqual(['refinery_bay', 'research_lab'])
  })

  it('logs FeatureUnlocked for a shipped dock building on arriving at its planet', () => {
    const shipped = scheduleWithShipped('research_lab')
    const unlocks = withRegistrations([LAB_PROBE], () => featureUnlocksOfTravelIn(shipped, 14, 15))
    expect(unlocks).toContainEqual({ type: 'FeatureUnlocked', featureId: 'research_lab' })
  })

  it('logs it once, never again on later travel', () => {
    const shipped = scheduleWithShipped('research_lab')
    const unlocks = withRegistrations([LAB_PROBE], () => featureUnlocksOfTravelIn(shipped, 15, 16))
    expect(unlocks).not.toContainEqual({ type: 'FeatureUnlocked', featureId: 'research_lab' })
  })

  it('keeps a vision row shut though its building stands, until the lock ships it', () => {
    const vision = scheduleWithStatus('research_lab', 'vision')
    const unlocks = withRegistrations([LAB_PROBE], () => featureUnlocksOfTravelIn(vision, 14, 15))
    expect(unlocks).not.toContainEqual({ type: 'FeatureUnlocked', featureId: 'research_lab' })
  })

  it('logs no FeatureUnlocked for an unregistered building, even when its row ships', () => {
    const shipped = scheduleWithShipped('research_lab')
    const unlocks = withRegistrations([], () => featureUnlocksOfTravelIn(shipped, 14, 15))
    expect(unlocks).not.toContainEqual({ type: 'FeatureUnlocked', featureId: 'research_lab' })
  })
})
