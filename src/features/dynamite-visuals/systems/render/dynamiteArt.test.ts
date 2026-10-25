import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { exportedSidecarOf } from '../../../../systems/art/artCatalogue'
import { blenderAssetIds, kernelBlenderAssetIds } from '../../../../systems/art/artIds'
import { chargeSizeCount } from '../../../../systems/economy/chargeSizes'
import { slice } from '../../register'
import { chargeTypes } from './chargeTypeLook'
import {
  BLAST_CRATER_ASSET_ID,
  DYNAMITE_RACK_ASSET_ID,
  dynamiteArtAssets,
  dynamiteSizes,
  pipsPerType,
  PLANTED_DYNAMITE_ASSET_ID,
} from './dynamiteArt'

const partsOf = (assetId: string) =>
  dynamiteArtAssets().find((asset) => asset.id === assetId)?.parts ?? []

const exportedPartsOf = (assetId: string) =>
  (exportedSidecarOf(SHIPPED_ART, assetId)?.parts ?? []).map((part) => part.id).sort()

describe('dynamite art', () => {
  it('registers a planted body and lamp for every size of the economy ladder, 12 since D1', () => {
    expect(dynamiteSizes()).toHaveLength(chargeSizeCount())
    expect(chargeSizeCount()).toBe(12)
    expect(partsOf(PLANTED_DYNAMITE_ASSET_ID)).toEqual(
      dynamiteSizes().flatMap((size) => [`planted-${size}`, `lamp-${size}`]),
    )
  })

  it('registers a rack bay per charge type with eight stock pips, the reel, the plunger and the nozzle', () => {
    expect(chargeTypes()).toEqual([1, 2, 3])
    expect(pipsPerType()).toBe(8)
    const parts = partsOf(DYNAMITE_RACK_ASSET_ID)
    expect(parts[0]).toBe('rack-frame')
    expect(parts.slice(1, 10)).toEqual([
      'slot-1',
      ...Array.from({ length: 8 }, (_, at) => `pip-1-${at + 1}`),
    ])
    expect(parts.slice(-3)).toEqual(['wire-reel', 'plunger', 'casing-nozzle'])
    expect(parts).toHaveLength(1 + 3 * 9 + 3)
  })

  it("registers a crater decal per type and the lined rim's two parts", () => {
    expect(partsOf(BLAST_CRATER_ASSET_ID)).toEqual([
      'crater-1',
      'crater-2',
      'crater-3',
      'crater-cased-rim',
      'crater-cased-trim',
    ])
  })

  it('ships the exported rack, prop and crater with the registered parts and no others', () => {
    for (const assetId of [
      DYNAMITE_RACK_ASSET_ID,
      PLANTED_DYNAMITE_ASSET_ID,
      BLAST_CRATER_ASSET_ID,
    ]) {
      expect({ assetId, parts: exportedPartsOf(assetId) }).toEqual({
        assetId,
        parts: [...partsOf(assetId)].sort(),
      })
    }
  })

  it('names its assets only while the slice is loaded, so the kernel list is unchanged without it', () => {
    const ids = [DYNAMITE_RACK_ASSET_ID, PLANTED_DYNAMITE_ASSET_ID, BLAST_CRATER_ASSET_ID]
    expect(withRegistrations([slice], blenderAssetIds)).toEqual(expect.arrayContaining(ids))
    expect(withRegistrations([], blenderAssetIds)).toEqual([...kernelBlenderAssetIds()].sort())
    expect(kernelBlenderAssetIds()).not.toEqual(expect.arrayContaining([ids[0]]))
  })
})
