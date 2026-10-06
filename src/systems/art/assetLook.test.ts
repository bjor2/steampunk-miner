import { describe, expect, it } from 'vitest'
import { assetQuadsOf, atlasMapsOf, atlasUvOf } from './assetLook'
import { placeholderSidecarOf } from './artCatalogue'
import { partsShownAtTier, placeholderQuadsOf } from './placeholderLook'
import { SHIPPED_ART } from '../../scene/shippedArt'

describe('asset look', () => {
  it('cuts a part from the atlas with v counting down from the image’s top row', () => {
    expect(atlasUvOf([256, 512, 128, 256], [1024, 2048])).toEqual([0.25, 0.375, 0.375, 0.25])
  })

  it('draws an asset with no exported parts sidecar as its flat placeholder quads with no atlas', () => {
    const quads = assetQuadsOf(SHIPPED_ART, 'ground-band-1', 1)
    expect(quads).toEqual(
      placeholderQuadsOf(SHIPPED_ART, 'ground-band-1', 1).map((quad) => ({ ...quad, uv: null })),
    )
    expect(atlasMapsOf(SHIPPED_ART, 'ground-band-1')).toBeNull()
  })

  it('draws the final vehicle from its atlas at every tier, keeping each part’s colour', () => {
    for (const tier of [1, 2, 3]) {
      const quads = assetQuadsOf(SHIPPED_ART, 'vehicle', tier)
      expect(quads.every((quad) => quad.uv !== null)).toBe(true)
      expect(quads.map((quad) => quad.colour)).toEqual(
        placeholderQuadsOf(SHIPPED_ART, 'vehicle', tier).map((quad) => quad.colour),
      )
    }
  })

  it('shows the placeholder’s part ids at every tier once the vehicle art is final', () => {
    const placeholder = placeholderSidecarOf(SHIPPED_ART, 'vehicle')?.parts ?? []
    for (const tier of [1, 2, 3, 4]) {
      const shown = partsShownAtTier(placeholder, tier).map((part) => part.id)
      expect(assetQuadsOf(SHIPPED_ART, 'vehicle', tier).map((quad) => quad.partId)).toEqual(shown)
    }
  })

  it('names the final vehicle’s three maps beside its sidecar under the page root', () => {
    expect(atlasMapsOf(SHIPPED_ART, 'vehicle')).toEqual({
      albedo: 'assets/vehicle/vehicle/vehicle.albedo.ktx2',
      normal: 'assets/vehicle/vehicle/vehicle.normal.ktx2',
      emissive: 'assets/vehicle/vehicle/vehicle.emissive.ktx2',
    })
  })

  it('cuts both enemies and the artefact cache from their atlases as their one placeholder part', () => {
    for (const assetId of ['enemy-crawler', 'enemy-burrower', 'prop-artefact-cache']) {
      const [quad, ...rest] = assetQuadsOf(SHIPPED_ART, assetId, 1)
      const [placeholder] = placeholderQuadsOf(SHIPPED_ART, assetId, 1)
      expect(rest).toEqual([])
      expect(quad.uv).not.toBeNull()
      expect({ ...quad, uv: null }).toEqual({ ...placeholder, uv: null })
    }
  })

  it('gives the enemies a glow map and the artefact cache none (S7c: nothing on the cache glows)', () => {
    expect(atlasMapsOf(SHIPPED_ART, 'enemy-crawler')?.emissive).toBe(
      'assets/enemy/enemy-crawler/enemy-crawler.emissive.ktx2',
    )
    expect(atlasMapsOf(SHIPPED_ART, 'enemy-burrower')?.emissive).toBe(
      'assets/enemy/enemy-burrower/enemy-burrower.emissive.ktx2',
    )
    expect(atlasMapsOf(SHIPPED_ART, 'prop-artefact-cache')).toEqual({
      albedo: 'assets/prop/prop-artefact-cache/prop-artefact-cache.albedo.ktx2',
      normal: 'assets/prop/prop-artefact-cache/prop-artefact-cache.normal.ktx2',
      emissive: null,
    })
  })
})
