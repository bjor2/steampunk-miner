import { describe, expect, it } from 'vitest'
import { builtFacilityRowIdsOn } from '../../../systems/authority/builtFacilities'
import { featureUnlocksOfTravel } from '../../../systems/authority/featureUnlocks'
import { dockFacilitiesOf } from './dockAddOnFacilities'
import { DOCK_ADD_ONS } from './dockAddOns'

// The loaded slice registers the three add-ons as dock buildings (#221 registry, #222 wiring), so
// these read the real registry, as the game does.

const ADD_ON_ROWS = ['scanner_station', 'research_lab', 'drone_bay']

const unlockedIdsOfTravel = (from: number, to: number) =>
  featureUnlocksOfTravel(from, to).flatMap((event) =>
    event.type === 'FeatureUnlocked' ? [event.featureId] : [],
  )

describe('dock add-on facilities', () => {
  it('registers one building per add-on, claiming its facility row', () => {
    expect(dockFacilitiesOf(DOCK_ADD_ONS)).toEqual([
      { id: 'dock-buildings.scanner-mast', scheduleRowId: 'scanner_station' },
      { id: 'dock-buildings.research-annex', scheduleRowId: 'research_lab' },
      { id: 'dock-buildings.drone-hangar', scheduleRowId: 'drone_bay' },
    ])
  })

  it('builds each row from its planet on: the mast at 14, the annex at 15, the hangar at 20', () => {
    const builtAddOnRowsOn = (planet: number) =>
      ADD_ON_ROWS.filter((rowId) => builtFacilityRowIdsOn(planet).has(rowId))
    expect(builtAddOnRowsOn(13)).toEqual([])
    expect(builtAddOnRowsOn(14)).toEqual(['scanner_station'])
    expect(builtAddOnRowsOn(19)).toEqual(['scanner_station', 'research_lab'])
    expect(builtAddOnRowsOn(20)).toEqual(ADD_ON_ROWS)
  })

  it('logs FeatureUnlocked for each row once, on arriving at its planet', () => {
    expect(unlockedIdsOfTravel(13, 14)).toContain('scanner_station')
    expect(unlockedIdsOfTravel(14, 15)).toContain('research_lab')
    expect(unlockedIdsOfTravel(19, 20)).toContain('drone_bay')
    expect(unlockedIdsOfTravel(15, 16)).toEqual([])
    expect(unlockedIdsOfTravel(20, 21).filter((id) => ADD_ON_ROWS.includes(id))).toEqual([])
  })
})
