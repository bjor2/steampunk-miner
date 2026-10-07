import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import {
  dockFacilityProblems,
  dockFacilityRowIdsOn,
  dockFacilityScheduleRowClaims,
  type DockFacility,
} from './dockFacilities'

// The dock-building registry (#221) on fake slices, so no real slice is imported.

function probeOf(...facilities: DockFacility[]): SliceDefinition {
  return { id: 'dock-probe', register: (r) => facilities.forEach((f) => r.dockFacility(f)) }
}

const MAST = { id: 'dock-probe.mast', scheduleRowId: 'scanner_station' }
const HANGAR = { id: 'dock-probe.hangar', scheduleRowId: 'drone_bay' }
const GUNS = { id: 'dock-probe.guns', scheduleRowId: 'auto_guns' }
const NOWHERE = { id: 'dock-probe.nowhere', scheduleRowId: 'no_such_row' }

describe('dock facilities', () => {
  it('stamps and claims nothing when no slice registers a building', () => {
    expect(withRegistrations([], () => dockFacilityRowIdsOn(40))).toEqual([])
    expect(withRegistrations([], dockFacilityScheduleRowClaims)).toEqual([])
  })

  it('finds every building of the loaded slices on a facility row', () => {
    expect(dockFacilityProblems()).toEqual([])
  })

  it('stamps each building from its own row planet: the mast at 14, the hangar at 20', () => {
    const rowsOn = (planet: number) =>
      withRegistrations([probeOf(MAST, HANGAR)], () => dockFacilityRowIdsOn(planet))
    expect([13, 14, 19, 20].map(rowsOn)).toEqual([
      [],
      ['scanner_station'],
      ['scanner_station'],
      ['drone_bay', 'scanner_station'],
    ])
  })

  it('claims each building row for the schedule coverage spec', () => {
    const claims = withRegistrations([probeOf(MAST)], dockFacilityScheduleRowClaims)
    expect(claims).toEqual([{ rowId: 'scanner_station', entryId: 'dock-probe.mast' }])
  })

  it('refuses a building on a row that is no facility row, and never stamps it', () => {
    const slices = [probeOf(GUNS, NOWHERE)]
    expect(withRegistrations(slices, dockFacilityProblems)).toEqual([
      'dock facility "dock-probe.guns" claims "auto_guns", which is no facility row of the schedule',
      'dock facility "dock-probe.nowhere" claims "no_such_row", which is no facility row of the schedule',
    ])
    expect(withRegistrations(slices, () => dockFacilityRowIdsOn(40))).toEqual([])
  })
})
