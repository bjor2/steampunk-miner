import { describe, expect, it } from 'vitest'
import {
  controlMinPixelsOf,
  screenLayoutOf,
  screenStyleOf,
  shopTextPixelsOf,
  stageRectOf,
  uiScaleOf,
} from './screenLayout'

const desktop = (widthPixels: number, heightPixels: number) => ({
  widthPixels,
  heightPixels,
  isCoarsePointer: false,
})
const phone = (widthPixels: number, heightPixels: number) => ({
  widthPixels,
  heightPixels,
  isCoarsePointer: true,
})

describe('screen layout: stage', () => {
  it('fills the window up to 64:27', () => {
    expect(stageRectOf(1920, 1080)).toEqual({ left: 0, width: 1920, height: 1080 })
    expect(stageRectOf(2560, 1080)).toEqual({ left: 0, width: 2560, height: 1080 })
    expect(stageRectOf(844, 390)).toEqual({ left: 0, width: 844, height: 390 })
  })

  it('pillarboxes a 32:9 screen to a centred 2560 px band (#173 acceptance 1)', () => {
    expect(stageRectOf(3840, 1080)).toEqual({ left: 640, width: 2560, height: 1080 })
  })

  it('leaves a portrait window whole, since the turn-your-device card covers it', () => {
    expect(stageRectOf(390, 844)).toEqual({ left: 0, width: 390, height: 844 })
  })
})

describe('screen layout: UI scale', () => {
  it('is 1 on the 1280 x 800 reference screen and grows with the short axis above it', () => {
    expect(uiScaleOf(800, false)).toBe(1)
    expect(uiScaleOf(1080, false)).toBe(1.35)
    expect(uiScaleOf(2160, false)).toBe(2.7)
  })

  it('never shrinks the UI on a phone', () => {
    expect(uiScaleOf(390, false)).toBe(1)
    expect(uiScaleOf(390, true)).toBe(1)
  })

  it('sets TV mode at 540 design pixels, so main text and labels meet the 10-foot minimums', () => {
    const scale = uiScaleOf(2160, true)
    expect(scale).toBe(4)
    // Today's 16 px body text and 12 px labels, against 2.78% and 2.22% of the short axis.
    expect((16 * scale) / 2160).toBeGreaterThanOrEqual(0.0278)
    expect((12 * scale) / 2160).toBeGreaterThanOrEqual(0.0222)
  })
})

describe('screen layout: controls and safe area', () => {
  it('keeps every control at least 44 px, and 56 px under a finger', () => {
    expect(controlMinPixelsOf(1080, false, false)).toBe(44)
    expect(controlMinPixelsOf(390, true, false)).toBe(56)
  })

  it('makes a TV-mode control at least 5.9% of the short axis tall', () => {
    expect(controlMinPixelsOf(2160, false, true) / 2160).toBeGreaterThanOrEqual(0.059)
    expect(controlMinPixelsOf(1080, false, true) / 1080).toBeGreaterThanOrEqual(0.059)
  })

  it('insets the UI 5% of each axis in TV mode only', () => {
    expect(screenLayoutOf(desktop(3840, 2160), true).tvSafeInset).toEqual({ x: 192, y: 108 })
    expect(screenLayoutOf(desktop(3840, 2160), false).tvSafeInset).toEqual({ x: 0, y: 0 })
  })

  it('reads the short axis of the pillarboxed stage', () => {
    expect(screenLayoutOf(desktop(3840, 1080), false).uiScale).toBe(1.35)
    expect(screenLayoutOf(phone(844, 390), false).controlMinPixels).toBe(56)
  })
})

describe('screen layout: bay-screen text', () => {
  it('is 2.2% of the short axis from the reference screen up (#45)', () => {
    expect(shopTextPixelsOf(1080, false)).toBeCloseTo(23.76, 9)
    expect(shopTextPixelsOf(2160, false)).toBeCloseTo(47.52, 9)
  })

  it("keeps the reference screen's 17.6 px on a phone instead of shrinking (#173)", () => {
    expect(shopTextPixelsOf(390, false)).toBeCloseTo(17.6, 9)
  })

  it('meets the 2.22% ten-foot minimum in TV mode (#173)', () => {
    expect(shopTextPixelsOf(2160, true) / 2160).toBeGreaterThanOrEqual(0.0222)
    expect(shopTextPixelsOf(1080, true) / 1080).toBeGreaterThanOrEqual(0.0222)
  })
})

describe('screen layout: style', () => {
  it('hands the layout to the style sheets as CSS custom properties', () => {
    expect(screenStyleOf(screenLayoutOf(desktop(3840, 1080), false))).toEqual({
      '--ui-scale': '1.35',
      '--stage-left': '640px',
      '--stage-width': '2560px',
      '--tv-safe-x': '0px',
      '--tv-safe-y': '0px',
      '--control-min': '44px',
      '--shop-text': '23.76px',
    })
  })
})
