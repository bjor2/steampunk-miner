import { describe, expect, it } from 'vitest'
import {
  controlMinPixelsOf,
  hintChipMaxHeightOf,
  hudDensityOf,
  screenLayoutOf,
  screenStyleOf,
  orientationOf,
  screenAttributesOf,
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

  it('never pillarboxes a portrait window: the stage is the whole window held upright', () => {
    expect(stageRectOf(390, 844)).toEqual({ left: 0, width: 390, height: 844 })
    expect(stageRectOf(820, 1180)).toEqual({ left: 0, width: 820, height: 1180 })
  })
})

describe('screen layout: orientation', () => {
  it('is portrait when the window is taller than wide, and landscape otherwise', () => {
    expect(orientationOf(390, 844)).toBe('portrait')
    expect(orientationOf(844, 390)).toBe('landscape')
    expect(orientationOf(800, 800)).toBe('landscape')
  })

  it('turns with the phone, so a rotation lays the same screen out the other way up', () => {
    expect(screenLayoutOf(phone(390, 844), false).orientation).toBe('portrait')
    expect(screenLayoutOf(phone(844, 390), false).orientation).toBe('landscape')
  })

  it('marks the page root with the orientation the panels switch their layout on', () => {
    expect(screenAttributesOf(screenLayoutOf(phone(390, 844), false))).toEqual({
      'data-orientation': 'portrait',
      'data-hud-density': 'compact',
    })
  })
})

describe('screen layout: HUD density (#500)', () => {
  it('marks the HUD compact on a finger below the 800 px short axis and full from it', () => {
    expect(hudDensityOf(799, true)).toBe('compact')
    expect(hudDensityOf(800, true)).toBe('full')
    expect(hudDensityOf(820, true)).toBe('full')
  })

  it('marks the HUD compact on any pointer below a 500 px short axis', () => {
    expect(hudDensityOf(499, false)).toBe('compact')
    expect(hudDensityOf(500, false)).toBe('full')
  })

  it('keeps the full HUD on a 1280 x 720 desktop window with a mouse (GD ruling 5)', () => {
    expect(screenLayoutOf(desktop(1280, 720), false).hudDensity).toBe('full')
    expect(screenLayoutOf(desktop(1920, 1080), true).hudDensity).toBe('full')
  })

  it('lays every phone cell and the small-phone sweep out compact, either way up', () => {
    const phones = [
      [390, 844],
      [412, 915],
      [844, 390],
      [915, 412],
      [360, 640],
      [320, 568],
      [640, 360],
    ]
    for (const [width, height] of phones) {
      expect(screenLayoutOf(phone(width, height), false).hudDensity).toBe('compact')
    }
  })

  it('keeps the tablet cells full, held upright or sideways', () => {
    expect(screenLayoutOf(phone(1180, 820), false).hudDensity).toBe('full')
    expect(screenLayoutOf(phone(820, 1180), false).hudDensity).toBe('full')
  })

  it('caps the hint chip at 8% of the screen height', () => {
    expect(hintChipMaxHeightOf(844)).toBeCloseTo(67.52, 2)
    expect(hintChipMaxHeightOf(390)).toBeCloseTo(31.2, 2)
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

  it('gives a 390 px short axis the same scale held upright or sideways', () => {
    expect(screenLayoutOf(phone(390, 844), false).uiScale).toBe(1)
    expect(screenLayoutOf(phone(844, 390), false).uiScale).toBe(1)
    expect(screenLayoutOf(phone(412, 915), false).uiScale).toBe(1)
  })

  it('reads a portrait tablet by its width, the short axis, as the landscape one by its height', () => {
    expect(screenLayoutOf(phone(820, 1180), false).uiScale).toBe(
      screenLayoutOf(phone(1180, 820), false).uiScale,
    )
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
      '--safe-top': 'max(env(safe-area-inset-top), 0px)',
      '--safe-right': 'max(env(safe-area-inset-right), 0px)',
      '--safe-bottom': 'max(env(safe-area-inset-bottom), 0px)',
      '--safe-left': 'max(env(safe-area-inset-left), 0px)',
      '--control-min': '44px',
      '--shop-text': '23.76px',
      '--hint-chip-max-height': '86.40px',
    })
  })

  it("mirrors the safe area as the larger of the device's inset and TV mode's on each side", () => {
    const style = screenStyleOf(screenLayoutOf(desktop(3840, 2160), true))
    expect(style['--safe-top']).toBe('max(env(safe-area-inset-top), 108px)')
    expect(style['--safe-left']).toBe('max(env(safe-area-inset-left), 192px)')
  })
})
