import { describe, expect, it } from 'vitest'
import { assetQuadsOf, atlasMapsOf, atlasUvOf } from './assetLook'
import { placeholderSidecarOf } from './artCatalogue'
import { partsShownAtTier, placeholderQuadsOf } from './placeholderLook'

describe('asset look', () => {
  it('cuts a part from the atlas with v counting down from the image’s top row', () => {
    expect(atlasUvOf([256, 512, 128, 256], [1024, 2048])).toEqual([0.25, 0.375, 0.375, 0.25])
  })

  it('draws a placeholder asset as its flat placeholder quads with no atlas', () => {
    const quads = assetQuadsOf('enemy-crawler', 1)
    expect(quads).toEqual(
      placeholderQuadsOf('enemy-crawler', 1).map((quad) => ({ ...quad, uv: null })),
    )
    expect(atlasMapsOf('enemy-crawler')).toBeNull()
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
})
