import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { FUEL_TENDER_TABLE } from '../render/fuelTenderLook'
import { isAttachId } from '../registries/vehicleAttach'
import { blenderAssetIds, categoryOfAssetId, isValidPartId, registryPartIds } from './artIds'
import { exportedSidecarOf, manifestEntryOf, placeholderSidecarOf } from './artCatalogue'
import { FUEL_TENDER_ASSET_ID, FUEL_TENDER_ATTACH_ID, fuelTenderArtPartIds } from './fuelTenderArt'

// The coal tender (ticket 758; the GD lock on #650): the fuel tank track's wagon at the hitch, a
// kernel Blender asset named from the fuel tank item, one wagon part per step of its ladder.
describe('fuel tender art', () => {
  it('names the asset from the kernel fuel tank item under the vehicle category', () => {
    expect(FUEL_TENDER_ASSET_ID).toBe('vehicle-fuel-tank')
    expect(categoryOfAssetId(FUEL_TENDER_ASSET_ID)).toBe('vehicle')
    expect(blenderAssetIds()).toContain(FUEL_TENDER_ASSET_ID)
  })

  it('hangs at the wagon hitch, the point the ladder table and the code agree on', () => {
    expect(isAttachId(FUEL_TENDER_ATTACH_ID)).toBe(true)
    expect(FUEL_TENDER_TABLE.attach).toBe(FUEL_TENDER_ATTACH_ID)
    expect(FUEL_TENDER_TABLE.assetId).toBe(FUEL_TENDER_ASSET_ID)
  })

  it('takes one part per ladder step and no other: the #758 wagons and the LK5 steps (ticket 813)', () => {
    expect(fuelTenderArtPartIds()).toEqual(FUEL_TENDER_TABLE.steps.map((step) => step.part))
    expect(fuelTenderArtPartIds()).toEqual([
      'coal-cart',
      'bunker-tender',
      'riveted-tender',
      'guild-tender',
      'twin-tank-tender',
      'hopper-tender',
      'glass-tank-tender',
    ])
    for (const partId of fuelTenderArtPartIds()) {
      expect(registryPartIds()).toContain(partId)
      expect(isValidPartId(FUEL_TENDER_ASSET_ID, partId)).toBe(true)
    }
    expect(isValidPartId(FUEL_TENDER_ASSET_ID, 't1-wheel')).toBe(false)
  })

  it('ships no emissive map, so the drill nose stays the brightest part by construction', () => {
    expect(placeholderSidecarOf(SHIPPED_ART, FUEL_TENDER_ASSET_ID)?.maps.emissive).toBe(false)
    expect(exportedSidecarOf(SHIPPED_ART, FUEL_TENDER_ASSET_ID)?.maps.emissive).toBe(false)
  })

  it('ships a manifest entry and a placeholder with every wagon, the hitch inside each', () => {
    expect(manifestEntryOf(SHIPPED_ART, FUEL_TENDER_ASSET_ID)).not.toBeNull()
    const placeholder = placeholderSidecarOf(SHIPPED_ART, FUEL_TENDER_ASSET_ID)
    expect(placeholder?.parts.map((part) => part.id).sort()).toEqual(
      [...fuelTenderArtPartIds()].sort(),
    )
    for (const part of placeholder?.parts ?? []) {
      expect(part.atM).toEqual([0, 0])
      expect(part.z).toBe(FUEL_TENDER_TABLE.z)
    }
  })
})
