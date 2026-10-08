import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { placeholderSidecarOf } from '../../../../systems/art/artCatalogue'
import { blenderAssetIds, kernelBlenderAssetIds } from '../../../../systems/art/artIds'
import { slice } from '../../register'
import { MAGNETIC_FIELD_ASSET_ID, magneticArtAssets } from './magneticArt'

const [ASSET] = magneticArtAssets()

describe('magnetic art', () => {
  it('keeps the stand-in on the registered ribbon and dash', () => {
    const placeholder = placeholderSidecarOf(SHIPPED_ART, MAGNETIC_FIELD_ASSET_ID)
    expect(placeholder?.parts.map((part) => part.id).sort()).toEqual(
      [...(ASSET.parts ?? [])].sort(),
    )
  })

  it('names its asset only while the slice is loaded, so the kernel list is unchanged without it', () => {
    expect(withRegistrations([slice], blenderAssetIds)).toContain(MAGNETIC_FIELD_ASSET_ID)
    expect(withRegistrations([], blenderAssetIds)).toEqual([...kernelBlenderAssetIds()].sort())
  })
})
