import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { blenderAssetIds, vehicleModuleAssetIdOf, vehicleModuleRowIds } from './artIds'
import { assetQuadsOf, atlasMapsOf } from './assetLook'
import { sidecarProblems } from './partsSidecar'
import { vehicleSidecar, WHEEL_PART as wheel } from './sidecarFixtures'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

// The auto_guns turret (#107, #108): a vehicle module drawn as its own part family on the hull.
describe('auto guns art', () => {
  it('names each vehicle module from a row of the locked unlock schedule', () => {
    const rowIds = LOCKED_SCHEDULE.rows.map((row) => row.id)
    expect(vehicleModuleRowIds().filter((row) => !rowIds.includes(row))).toEqual([])
    expect(blenderAssetIds()).toContain(vehicleModuleAssetIdOf('auto_guns'))
    expect(vehicleModuleAssetIdOf('auto_guns')).toBe('vehicle-auto-guns')
  })

  it('takes the tiered part names of a vehicle module on its own asset only', () => {
    const barrel = { ...wheel, id: 't2-gun-barrel', tier: 2 }
    const guns = {
      ...vehicleSidecar([{ ...wheel, id: 't1-turret-head' }, barrel]),
      assetId: 'vehicle-auto-guns',
      maps: {
        albedo: 'vehicle-auto-guns.albedo.ktx2',
        normal: 'vehicle-auto-guns.normal.ktx2',
        emissive: 'vehicle-auto-guns.emissive.ktx2',
      },
    }
    expect(sidecarProblems('vehicle-auto-guns', guns)).toEqual([])
    expect(sidecarProblems('vehicle-auto-guns', { ...guns, parts: [wheel] })).toEqual([
      'vehicle-auto-guns.parts.json: part "t1-wheel" is not a valid part id',
    ])
    expect(sidecarProblems('vehicle', vehicleSidecar([barrel]))).toEqual([
      'vehicle.parts.json: part "t2-gun-barrel" is not a valid part id',
    ])
  })

  it('keeps the auto guns’ mount and head at every look and swaps only the barrel at looks 2 and 3', () => {
    const partsAt = (look: number) =>
      assetQuadsOf(SHIPPED_ART, 'vehicle-auto-guns', look).map((q) => q.partId)
    expect(partsAt(1)).toEqual(['t1-turret-mount', 't1-gun-barrel', 't1-turret-head'])
    expect(partsAt(2)).toEqual(['t1-turret-mount', 't2-gun-barrel', 't1-turret-head'])
    expect(partsAt(3)).toEqual(['t1-turret-mount', 't3-gun-barrel', 't1-turret-head'])
  })

  it('draws the final auto guns from their atlas, with an emissive map for the pilot lamp', () => {
    expect(
      assetQuadsOf(SHIPPED_ART, 'vehicle-auto-guns', 3).every((quad) => quad.uv !== null),
    ).toBe(true)
    expect(atlasMapsOf(SHIPPED_ART, 'vehicle-auto-guns')?.emissive).toBe(
      'assets/vehicle/vehicle-auto-guns/vehicle-auto-guns.emissive.ktx2',
    )
  })

  it('turns the auto guns’ barrel and head about one trunnion above the vehicle’s hull', () => {
    const quads = assetQuadsOf(SHIPPED_ART, 'vehicle-auto-guns', 3)
    const trunnions = quads.filter((q) => q.partId !== 't1-turret-mount').map((q) => q.pivot)
    expect(new Set(trunnions.map((pivot) => pivot.join()))).toHaveLength(1)
    const vehicleTop = Math.max(
      ...assetQuadsOf(SHIPPED_ART, 'vehicle', 3).map((q) => q.centre[1] + q.size[1] / 2),
    )
    expect(trunnions[0][1]).toBeGreaterThan(vehicleTop)
  })
})
