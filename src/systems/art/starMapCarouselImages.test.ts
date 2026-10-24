import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { firstSystemPreviewAssetIds } from './starMapCarouselArt'
import { previewImagesAt, starMapCarouselImagesOf } from './starMapCarouselImages'

// Ticket 796 draws ticket 795's shipped sprites as images: every first-system hero and dot, and
// the system strip's backdrop, frame and markers, at the brief's 1x size; a planet with no
// preview falls back to its tinted glyph.

describe('star map carousel images (ticket 796)', () => {
  const images = starMapCarouselImagesOf(SHIPPED_ART)

  it("draws every first-system planet's shipped hero and orbit dot from its 1x and 2x files", () => {
    for (const assetId of firstSystemPreviewAssetIds()) {
      const { hero, dot } = previewImagesAt(images, assetId)
      expect(hero?.src).toBe(`assets/ui/${assetId}/${assetId}.png`)
      expect(hero?.srcSet).toContain(`${assetId}@2x.png 2x`)
      expect(hero?.sizePx).toEqual([256, 256])
      expect(dot?.sizePx).toEqual([24, 24])
    }
  })

  it("draws the system strip's backdrop, frame, here ring and selected marker", () => {
    expect(images.backdrop?.sizePx).toEqual([1008, 252])
    expect(images.frame?.sizePx).toEqual([64, 64])
    expect(images.here?.sizePx).toEqual([36, 36])
    expect(images.selected?.sizePx).toEqual([44, 44])
  })

  it('has no images for a planet whose preview the kernel cannot name', () => {
    expect(previewImagesAt(images, null)).toEqual({ hero: null, dot: null })
  })
})
