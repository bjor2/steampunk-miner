import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { exportedSidecarOf } from '../../../../systems/art/artCatalogue'
import { blenderAssetIds, kernelBlenderAssetIds } from '../../../../systems/art/artIds'
import { chargeSizeCount } from '../../../../systems/economy/chargeSizes'
import { slice } from '../../register'
import {
  DYNAMITE_RACK_ASSET_ID,
  dynamiteArtAssets,
  dynamiteSizes,
  lampPartIdOf,
  PLANTED_DYNAMITE_ASSET_ID,
  plantedPartIdOf,
} from './dynamiteArt'

const partsOf = (assetId: string) =>
  dynamiteArtAssets().find((asset) => asset.id === assetId)?.parts ?? []

const exportedPartsOf = (assetId: string) =>
  (exportedSidecarOf(SHIPPED_ART, assetId)?.parts ?? []).map((part) => part.id).sort()

describe('dynamite art', () => {
  it('registers a stick and a planted body and lamp for the ten modelled sizes of the economy', () => {
    expect(dynamiteSizes()).toHaveLength(10)
    expect(chargeSizeCount()).toBeGreaterThan(10)
    expect(partsOf(DYNAMITE_RACK_ASSET_ID)).toEqual([
      'rack-frame',
      ...dynamiteSizes().map((size) => `stick-${size}`),
      'wire-reel',
    ])
    expect(partsOf(PLANTED_DYNAMITE_ASSET_ID)).toEqual(
      dynamiteSizes().flatMap((size) => [`planted-${size}`, `lamp-${size}`]),
    )
    expect(partsOf(PLANTED_DYNAMITE_ASSET_ID)).not.toContain('planted-11')
  })

  it('dresses a size past the modelled ten in size 10 until its own art lands (#866)', () => {
    expect([plantedPartIdOf(11), lampPartIdOf(12)]).toEqual(['planted-10', 'lamp-10'])
    expect(plantedPartIdOf(3)).toBe('planted-3')
  })

  it('ships the exported rack and prop with the registered parts and no others', () => {
    expect(exportedPartsOf(DYNAMITE_RACK_ASSET_ID)).toEqual(
      [...partsOf(DYNAMITE_RACK_ASSET_ID)].sort(),
    )
    expect(exportedPartsOf(PLANTED_DYNAMITE_ASSET_ID)).toEqual(
      [...partsOf(PLANTED_DYNAMITE_ASSET_ID)].sort(),
    )
  })

  it('names its assets only while the slice is loaded, so the kernel list is unchanged without it', () => {
    const ids = [DYNAMITE_RACK_ASSET_ID, PLANTED_DYNAMITE_ASSET_ID]
    expect(withRegistrations([slice], blenderAssetIds)).toEqual(expect.arrayContaining(ids))
    expect(withRegistrations([], blenderAssetIds)).toEqual([...kernelBlenderAssetIds()].sort())
    expect(kernelBlenderAssetIds()).not.toEqual(expect.arrayContaining([ids[0]]))
  })
})
