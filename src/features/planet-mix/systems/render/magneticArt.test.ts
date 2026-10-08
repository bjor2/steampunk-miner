import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { exportedSidecarOf, placeholderSidecarOf } from '../../../../systems/art/artCatalogue'
import { blenderAssetIds, kernelBlenderAssetIds } from '../../../../systems/art/artIds'
import { slice } from '../../register'
import { skyBandRibbonArtOf } from '../../../../systems/render/skyBandLook'
import { MAGNETIC_AURORA } from './auroraBand'
import { fieldDashArtOf, MAGNETIC_FIELD_ASSET_ID, magneticArtAssets } from './magneticArt'

const [ASSET] = magneticArtAssets()

describe('magnetic art', () => {
  it('keeps the stand-in on the registered ribbon and dash', () => {
    const placeholder = placeholderSidecarOf(SHIPPED_ART, MAGNETIC_FIELD_ASSET_ID)
    expect(placeholder?.parts.map((part) => part.id).sort()).toEqual(
      [...(ASSET.parts ?? [])].sort(),
    )
  })

  it('ships the Blender export with the registered ribbon and dash and no others', () => {
    const exported = exportedSidecarOf(SHIPPED_ART, MAGNETIC_FIELD_ASSET_ID)
    expect(exported?.parts.map((part) => part.id).sort()).toEqual([...(ASSET.parts ?? [])].sort())
    expect(exported?.maps.emissive).toBe('prop-magnetic-field.emissive.ktx2')
  })

  it('draws the band and the dashes from the baked glow, the ribbon 3 to 1 over the band', () => {
    const ribbon = skyBandRibbonArtOf(SHIPPED_ART, MAGNETIC_AURORA)
    expect(ribbon?.lengthM).toBeCloseTo(MAGNETIC_AURORA.thicknessM * 3, 6)
    expect(fieldDashArtOf(SHIPPED_ART)?.map).toBe(
      'assets/prop/prop-magnetic-field/prop-magnetic-field.emissive.ktx2',
    )
  })

  it('names its asset only while the slice is loaded, so the kernel list is unchanged without it', () => {
    expect(withRegistrations([slice], blenderAssetIds)).toContain(MAGNETIC_FIELD_ASSET_ID)
    expect(withRegistrations([], blenderAssetIds)).toEqual([...kernelBlenderAssetIds()].sort())
  })
})
