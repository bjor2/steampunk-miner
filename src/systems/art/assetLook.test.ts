import { describe, expect, it } from 'vitest'
import { assetQuadsOf, atlasMapsOf, atlasUvOf } from './assetLook'
import { placeholderSidecarOf } from './artCatalogue'
import { partsShownAtTier, placeholderQuadsOf } from './placeholderLook'

describe('asset look', () => {
  it('cuts a part from the atlas with v counting down from the image’s top row', () => {
    expect(atlasUvOf([256, 512, 128, 256], [1024, 2048])).toEqual([0.25, 0.375, 0.375, 0.25])
  })

  it('draws an asset with no exported parts sidecar as its flat placeholder quads with no atlas', () => {
    const quads = assetQuadsOf('ground-band-1', 1)
    expect(quads).toEqual(
      placeholderQuadsOf('ground-band-1', 1).map((quad) => ({ ...quad, uv: null })),
    )
    expect(atlasMapsOf('ground-band-1')).toBeNull()
  })

  it('draws the final vehicle from its atlas at every tier, keeping each part’s colour', () => {
    for (const tier of [1, 2, 3]) {
      const quads = assetQuadsOf('vehicle', tier)
      expect(quads.every((quad) => quad.uv !== null)).toBe(true)
      expect(quads.map((quad) => quad.colour)).toEqual(
        placeholderQuadsOf('vehicle', tier).map((quad) => quad.colour),
      )
    }
  })

  it('shows the placeholder’s part ids at every tier once the vehicle art is final', () => {
    const placeholder = placeholderSidecarOf('vehicle')?.parts ?? []
    for (const tier of [1, 2, 3, 4]) {
      const shown = partsShownAtTier(placeholder, tier).map((part) => part.id)
      expect(assetQuadsOf('vehicle', tier).map((quad) => quad.partId)).toEqual(shown)
    }
  })

  it('names the final vehicle’s three maps beside its sidecar under the page root', () => {
    expect(atlasMapsOf('vehicle')).toEqual({
      albedo: 'assets/vehicle/vehicle/vehicle.albedo.ktx2',
      normal: 'assets/vehicle/vehicle/vehicle.normal.ktx2',
      emissive: 'assets/vehicle/vehicle/vehicle.emissive.ktx2',
    })
  })

  it('cuts both enemies and the artefact cache from their atlases as their one placeholder part', () => {
    for (const assetId of ['enemy-crawler', 'enemy-burrower', 'prop-artefact-cache']) {
      const [quad, ...rest] = assetQuadsOf(assetId, 1)
      const [placeholder] = placeholderQuadsOf(assetId, 1)
      expect(rest).toEqual([])
      expect(quad.uv).not.toBeNull()
      expect({ ...quad, uv: null }).toEqual({ ...placeholder, uv: null })
    }
  })

  it('gives the enemies a glow map and the artefact cache none (S7c: nothing on the cache glows)', () => {
    expect(atlasMapsOf('enemy-crawler')?.emissive).toBe(
      'assets/enemy/enemy-crawler/enemy-crawler.emissive.ktx2',
    )
    expect(atlasMapsOf('enemy-burrower')?.emissive).toBe(
      'assets/enemy/enemy-burrower/enemy-burrower.emissive.ktx2',
    )
    expect(atlasMapsOf('prop-artefact-cache')).toEqual({
      albedo: 'assets/prop/prop-artefact-cache/prop-artefact-cache.albedo.ktx2',
      normal: 'assets/prop/prop-artefact-cache/prop-artefact-cache.normal.ktx2',
      emissive: null,
    })
  })

  it('cuts the tunnel wrecker from its atlas as its one placeholder part, with a glow map', () => {
    const [quad, ...rest] = assetQuadsOf('enemy-tunnel-wrecker', 1)
    const [placeholder] = placeholderQuadsOf('enemy-tunnel-wrecker', 1)
    expect(rest).toEqual([])
    expect(quad.uv).not.toBeNull()
    expect({ ...quad, uv: null }).toEqual({ ...placeholder, uv: null })
    expect(atlasMapsOf('enemy-tunnel-wrecker')?.emissive).toBe(
      'assets/enemy/enemy-tunnel-wrecker/enemy-tunnel-wrecker.emissive.ktx2',
    )
  })
})
