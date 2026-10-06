import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { exportedSidecarOf, placeholderSidecarOf } from './artCatalogue'
import {
  blenderAssetIds,
  isValidPartId,
  SHOP_BUILDING_ATTACH_IDS,
  SHOP_BUILDING_BAY_IDS,
  shopBuildingAssetIdOf,
  shopBuildingMovingPartIdsOf,
  shopBuildingShellPartIdOf,
} from './artIds'
import { assetQuadsOf } from './assetLook'
import { attachPointOf, type PartsSidecar } from './partsSidecar'

// The Sell shop and Workshop buildings of #170 (art #174): two platform assets with the attach
// points the sell burst (#171), the showcase (#180) and the dock camera read.
describe('shop building art', () => {
  it('names a building for the Sell and Workshop bays, and none for the Refinery', () => {
    expect(SHOP_BUILDING_BAY_IDS).toEqual(['sell', 'upgrade'])
    expect(blenderAssetIds()).toEqual(
      expect.arrayContaining(['platform-building-sell', 'platform-building-upgrade']),
    )
    expect(blenderAssetIds()).not.toContain('platform-building-refinery')
  })

  it('gives each building one shell part and only the parts that move (#170 budget)', () => {
    expect(shopBuildingMovingPartIdsOf('sell')).toEqual(['sell-ticker'])
    expect(shopBuildingMovingPartIdsOf('upgrade')).toEqual([
      'workshop-gantry',
      'workshop-turntable',
    ])
    for (const bay of SHOP_BUILDING_BAY_IDS) {
      const asset = shopBuildingAssetIdOf(bay)
      const parts = [shopBuildingShellPartIdOf(bay), ...shopBuildingMovingPartIdsOf(bay)]
      expect(parts.every((part) => isValidPartId(asset, part))).toBe(true)
      expect(isValidPartId(asset, 'workshop-crane')).toBe(false)
    }
    expect(isValidPartId('platform-building-sell', 'workshop-gantry')).toBe(true)
  })

  it('resolves every attach point of the Game Director’s seven in its building’s sidecar', () => {
    for (const bay of SHOP_BUILDING_BAY_IDS) {
      const sidecar = shippedSidecarOf(shopBuildingAssetIdOf(bay))
      const unresolved = SHOP_BUILDING_ATTACH_IDS[bay].filter(
        (id) => attachPointOf(sidecar, id) === null,
      )
      expect({ bay, unresolved }).toEqual({ bay, unresolved: [] })
      expect(sidecar.attach).toHaveLength(SHOP_BUILDING_ATTACH_IDS[bay].length)
    }
  })

  it('hangs the chute over the vehicle, puts the stacks above the roofs and the turntable on the floor', () => {
    const sell = shippedSidecarOf('platform-building-sell')
    const workshop = shippedSidecarOf('platform-building-upgrade')
    expect(attachPointOf(sell, 'sell.chute')?.atM[1]).toBeLessThan(VEHICLE_HEIGHT_M)
    expect(attachPointOf(sell, 'sell.stack')?.atM[1]).toBeGreaterThan(topOf(sell) - 1)
    expect(attachPointOf(workshop, 'workshop.stack')?.atM[1]).toBeGreaterThan(topOf(workshop) - 1)
    expect(attachPointOf(workshop, 'workshop.platform')?.atM).toEqual([0, 0])
    expect(attachPointOf(workshop, 'workshop.showcase_cam')?.atM[1]).toBeGreaterThan(0)
  })

  it('tells the buildings apart by silhouette: Sell is taller than wide, the Workshop wider', () => {
    const sell = shellQuadOf('sell')
    const workshop = shellQuadOf('upgrade')
    expect(sell.size[1]).toBeGreaterThan(sell.size[0])
    expect(workshop.size[0]).toBeGreaterThan(workshop.size[1])
    expect(workshop.size[0]).toBeGreaterThan(sell.size[0])
  })

  it('draws both buildings from their atlases with warm window light on an emissive map', () => {
    for (const bay of SHOP_BUILDING_BAY_IDS) {
      const quads = assetQuadsOf(SHIPPED_ART, shopBuildingAssetIdOf(bay), 1)
      expect(quads.every((quad) => quad.uv !== null)).toBe(true)
      expect(shippedSidecarOf(shopBuildingAssetIdOf(bay)).maps.emissive).not.toBe(false)
    }
  })
})

/** The chute mouth sits within a vehicle height of the pad, where the rig's hopper is. */
const VEHICLE_HEIGHT_M = 2

function shippedSidecarOf(assetId: string): PartsSidecar {
  const sidecar =
    exportedSidecarOf(SHIPPED_ART, assetId) ?? placeholderSidecarOf(SHIPPED_ART, assetId)
  if (sidecar === null) throw new Error(`${assetId} has no sidecar`)
  return sidecar
}

function topOf(sidecar: PartsSidecar): number {
  return Math.max(...sidecar.parts.map((part) => part.atM[1] - part.pivotM[1] + part.sizeM[1]))
}

function shellQuadOf(bay: 'sell' | 'upgrade') {
  const quads = assetQuadsOf(SHIPPED_ART, shopBuildingAssetIdOf(bay), 1)
  const shell = quads.find((quad) => quad.partId === shopBuildingShellPartIdOf(bay))
  if (shell === undefined) throw new Error(`${bay} has no shell quad`)
  return shell
}
