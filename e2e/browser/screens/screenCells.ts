/**
 * The screen matrix of #173 ("Verification", the TD's comment and its amendment): every reference
 * screen with what the decision says it must show there. The expectations are the decision's own
 * tables, not the game's formulas, so a spec disagreeing with the code is a finding.
 */
export interface ScreenCell {
  name: string
  viewport: { width: number; height: number }
  deviceScaleFactor: number
  /** Touch and a coarse pointer: `isMobile` and `hasTouch` in the browser. */
  isTouch: boolean
  isTvMode: boolean
  isPortrait: boolean
  /** The widest view, metres across the short axis (TD's cap table). */
  maxViewShortAxisMetres: number
  /** The render-scale floor (TD's tier table). */
  renderScaleFloor: number
  /** The stage the canvas fills: the window, pillarboxed past 64:27. */
  stage: { left: number; width: number }
}

export const SCREEN_CELLS: readonly ScreenCell[] = [
  {
    name: 'desktop',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isTouch: false,
    isTvMode: false,
    isPortrait: false,
    maxViewShortAxisMetres: 20,
    renderScaleFloor: 1,
    stage: { left: 0, width: 1920 },
  },
  {
    name: 'ultra-wide',
    viewport: { width: 2560, height: 1080 },
    deviceScaleFactor: 1,
    isTouch: false,
    isTvMode: false,
    isPortrait: false,
    maxViewShortAxisMetres: 15.86,
    renderScaleFloor: 1,
    stage: { left: 0, width: 2560 },
  },
  {
    name: '32x9',
    viewport: { width: 3840, height: 1080 },
    deviceScaleFactor: 1,
    isTouch: false,
    isTvMode: false,
    isPortrait: false,
    maxViewShortAxisMetres: 15.86,
    renderScaleFloor: 1,
    stage: { left: 640, width: 2560 },
  },
  {
    name: 'tv',
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
    isTouch: false,
    isTvMode: true,
    isPortrait: false,
    maxViewShortAxisMetres: 20,
    renderScaleFloor: 0.5,
    stage: { left: 0, width: 3840 },
  },
  {
    name: 'tv-1080p',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isTouch: false,
    isTvMode: true,
    isPortrait: false,
    maxViewShortAxisMetres: 20,
    renderScaleFloor: 1,
    stage: { left: 0, width: 1920 },
  },
  {
    name: 'phone-landscape',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isTouch: true,
    isTvMode: false,
    isPortrait: false,
    maxViewShortAxisMetres: 17.11,
    renderScaleFloor: 0.5,
    stage: { left: 0, width: 844 },
  },
  {
    name: 'pixel-landscape',
    viewport: { width: 915, height: 412 },
    deviceScaleFactor: 2.625,
    isTouch: true,
    isTvMode: false,
    isPortrait: false,
    maxViewShortAxisMetres: 16.75,
    renderScaleFloor: 0.5,
    stage: { left: 0, width: 915 },
  },
  {
    name: 'phone-portrait',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isTouch: true,
    isTvMode: false,
    isPortrait: true,
    maxViewShortAxisMetres: 17.11,
    renderScaleFloor: 0.5,
    stage: { left: 0, width: 390 },
  },
  {
    name: 'tablet',
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    isTouch: true,
    isTvMode: false,
    isPortrait: false,
    maxViewShortAxisMetres: 20,
    renderScaleFloor: 0.5,
    stage: { left: 0, width: 1180 },
  },
]
