import { describe, expect, it } from 'vitest'
import { MAX_PLATFORM_PARTS } from '../../../constants/scene'
import { isKebabId } from '../../../systems/art/artNaming'
import { shopBuildingAssetIds } from '../../../systems/art/shopBuildingArt'
import { REFINERY_BAY_ROW_ID } from '../../../systems/authority/refinery/refineryFacility'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import {
  DOCK_ADD_ONS,
  MAX_DOCK_ADD_ON_PARTS,
  dockAddOnAssetIdOf,
  dockAddOnOfRow,
  dockAddOnPartIdsOf,
  standingDockAddOnsOf,
} from './dockAddOns'

/** #170 amendment: the base set of the buildings and the Refinery stays at 30 parts or fewer. */
const BASE_PLATFORM_PARTS = 30
const ADD_ON_ROWS = ['scanner_station', 'research_lab', 'drone_bay']

function scheduleRowOf(rowId: string) {
  return LOCKED_SCHEDULE.rows.find((row) => row.id === rowId)
}

describe('dock add-ons', () => {
  it('is one add-on per in-place facility row of the schedule, in unlock order', () => {
    expect(DOCK_ADD_ONS.map((addOn) => addOn.rowId)).toEqual(ADD_ON_ROWS)
    const planets = DOCK_ADD_ONS.map((addOn) => scheduleRowOf(addOn.rowId)?.planetIndex)
    expect(planets).toEqual([14, 15, 20])
    DOCK_ADD_ONS.forEach((addOn) => expect(scheduleRowOf(addOn.rowId)?.bind).toBe('facility'))
  })

  it('bolts the mast onto the Assay & Exchange and the annex and hangar onto the Works', () => {
    expect(dockAddOnOfRow('scanner_station')?.host).toBe('sell')
    expect(dockAddOnOfRow('research_lab')).toMatchObject({ host: 'upgrade', layer: 'behind' })
    expect(dockAddOnOfRow('drone_bay')).toMatchObject({ host: 'upgrade', layer: 'front' })
    expect(dockAddOnOfRow(REFINERY_BAY_ROW_ID)).toBeNull()
  })

  it('names each asset from its row id under the platform category, apart from the buildings', () => {
    const assetIds = DOCK_ADD_ONS.map(dockAddOnAssetIdOf)
    expect(assetIds).toEqual([
      'platform-scanner-station',
      'platform-research-lab',
      'platform-drone-bay',
    ])
    expect(assetIds.filter((id) => shopBuildingAssetIds().includes(id))).toEqual([])
  })

  it('gives every add-on at most two parts: its shell and the one part that moves', () => {
    DOCK_ADD_ONS.forEach((addOn) => {
      const parts = dockAddOnPartIdsOf(addOn)
      expect(parts.length).toBeLessThanOrEqual(MAX_DOCK_ADD_ON_PARTS)
      expect(parts[0]).toBe(dockAddOnAssetIdOf(addOn))
      expect(parts.every(isKebabId)).toBe(true)
    })
    const allParts = DOCK_ADD_ONS.flatMap(dockAddOnPartIdsOf)
    expect(new Set(allParts).size).toBe(allParts.length)
  })

  it('fits the three add-ons over the base set inside the platform part budget', () => {
    const addOnParts = DOCK_ADD_ONS.flatMap(dockAddOnPartIdsOf).length
    expect(BASE_PLATFORM_PARTS + addOnParts).toBeLessThanOrEqual(MAX_PLATFORM_PARTS)
  })

  it('stands only the add-ons whose facility row the platform has built', () => {
    expect(standingDockAddOnsOf(new Set())).toEqual([])
    expect(standingDockAddOnsOf(new Set([REFINERY_BAY_ROW_ID]))).toEqual([])
    const labOnly = standingDockAddOnsOf(new Set([REFINERY_BAY_ROW_ID, 'research_lab']))
    expect(labOnly.map((addOn) => addOn.id)).toEqual(['research_annex'])
    const all = standingDockAddOnsOf(new Set([...ADD_ON_ROWS].reverse()))
    expect(all.map((addOn) => addOn.id)).toEqual(['scanner_mast', 'research_annex', 'drone_hangar'])
  })
})
