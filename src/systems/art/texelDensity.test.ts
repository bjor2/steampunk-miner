import { describe, expect, it } from 'vitest'
import { CANVAS_DPR_RANGE, VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import { pixelsPerMetreOf } from '../render/viewZoom'
import { ASSET_CATEGORIES, pxPerMetreOf } from './artIds'

// #173 "TV": no hero sprite is upscaled at the 12 m default, so nothing looks blurry on a 4K TV
// (platform art at 256 px/m needs 180 px/m there). Every baked texel density must cover the
// screen's own pixels per metre at the default zoom.

describe('texel density against the screen (#173)', () => {
  it.each(ASSET_CATEGORIES)(
    'bakes %s art at no fewer pixels per metre than a 4K TV shows',
    (category) => {
      const tvPixelsPerMetre = pixelsPerMetreOf(3840, 2160, VIEW_SHORT_AXIS_DEFAULT_M)
      expect(tvPixelsPerMetre).toBe(180)
      expect(pxPerMetreOf(category)).toBeGreaterThanOrEqual(tvPixelsPerMetre)
    },
  )

  it('covers a 1440p screen at the canvas DPR cap of 2 as well', () => {
    const [, maxDpr] = CANVAS_DPR_RANGE
    const shownPixelsPerMetre = pixelsPerMetreOf(
      2560 * maxDpr,
      1440 * maxDpr,
      VIEW_SHORT_AXIS_DEFAULT_M,
    )
    for (const category of ASSET_CATEGORIES) {
      expect(pxPerMetreOf(category)).toBeGreaterThanOrEqual(shownPixelsPerMetre)
    }
  })
})
