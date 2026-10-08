import { describe, expect, it } from 'vitest'
import { SKY_BAND_CURTAIN_REPEAT_M } from '../../constants/scene'
import { artCatalogueOf } from '../art/artCatalogue'
import type { ManifestEntry } from '../art/assetManifest'
import type { PartsSidecar } from '../art/partsSidecar'
import type { PlanetSkyBandLook } from '../registries/planetSkyBand'
import { skyBandRepeatOf, skyBandRibbonArtOf, skyBandRibbonMapOf } from './skyBandLook'

const ASSET_ID = 'prop-fake-band'

const LOOK: PlanetSkyBandLook = {
  colour: '#5fb4ff',
  heightM: 3,
  thicknessM: 4,
  flicker: 0.4,
  ribbon: { assetId: ASSET_ID, partId: 'ribbon' },
}

function entryOf(status: ManifestEntry['status']): ManifestEntry {
  return { id: ASSET_ID, source: 'blender', form: 'parts', status, color: '#5fb4ff' }
}

const SIDECAR: PartsSidecar = {
  assetId: ASSET_ID,
  schema: 1,
  source: { blend: `art/blender/${ASSET_ID}/${ASSET_ID}.blend`, sha256: null, blender: null },
  pxPerMetre: 64,
  atlasPx: [1024, 256],
  maps: {
    albedo: `${ASSET_ID}.albedo.ktx2`,
    normal: `${ASSET_ID}.normal.ktx2`,
    emissive: `${ASSET_ID}.emissive.ktx2`,
  },
  parts: [
    {
      id: 'ribbon',
      tier: 1,
      rect: [0, 0, 512, 128],
      sizeM: [8, 2],
      pivotM: [4, 1],
      atM: [0, 0],
      z: 1,
    },
  ],
}

describe('sky band look', () => {
  it('repeats the final ribbon at its own aspect over the band’s thickness', () => {
    const art = artCatalogueOf([entryOf('final')], [SIDECAR], [SIDECAR])
    const ribbon = skyBandRibbonArtOf(art, LOOK)
    expect(ribbon?.lengthM).toBe(16)
    expect(ribbon?.maps.albedo).toBe(`assets/prop/${ASSET_ID}/${ASSET_ID}.albedo.ktx2`)
    expect(ribbon?.uv).toEqual([0, 0.5, 0.5, 0])
    expect(skyBandRepeatOf(ribbon ?? null)).toBe(16)
    expect(ribbon && skyBandRibbonMapOf(ribbon)).toBe(
      `assets/prop/${ASSET_ID}/${ASSET_ID}.emissive.ktx2`,
    )
  })

  it('draws the procedural curtains while the ribbon’s asset is a placeholder', () => {
    const art = artCatalogueOf([entryOf('placeholder')], [SIDECAR], [])
    expect(skyBandRibbonArtOf(art, LOOK)).toBeNull()
    expect(skyBandRepeatOf(null)).toBe(SKY_BAND_CURTAIN_REPEAT_M)
  })

  it('draws the procedural curtains with no ribbon named, or a part the asset lacks', () => {
    const art = artCatalogueOf([entryOf('final')], [SIDECAR], [SIDECAR])
    expect(skyBandRibbonArtOf(art, { ...LOOK, ribbon: null })).toBeNull()
    expect(
      skyBandRibbonArtOf(art, { ...LOOK, ribbon: { assetId: ASSET_ID, partId: 'missing' } }),
    ).toBeNull()
  })
})
