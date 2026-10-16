import { describe, expect, it } from 'vitest'
import { addFrame, createFrameWindow, frameMsAt, type FrameWindow } from './frameWindow'
import {
  adaptRenderScale,
  capRenderScale,
  createRenderScale,
  drawnRenderScaleOf,
  isRenderScaleAtFloor,
  pinRenderScale,
  refloorRenderScale,
  renderScaleFloorOf,
  type RenderScale,
} from './renderScale'

const AT_4K = { cssPixels: 2160, devicePixels: 2160 }
const AT_1080P = { cssPixels: 1080, devicePixels: 1080 }
/** #173 reference phone: 844 x 390 CSS at DPR 3, capped to 2 by the canvas. */
const PHONE_LANDSCAPE = { cssPixels: 390, devicePixels: 780 }

/** One second of frames at a steady frame time, adapting after each frame as the scene does. */
function runSecond(state: RenderScale, window: FrameWindow, frameMs: number): void {
  const frames = Math.ceil(1000 / frameMs)
  for (let frame = 0; frame < frames; frame++) {
    addFrame(window, frameMs / 1000)
    adaptRenderScale(state, window)
  }
}

function runSeconds(state: RenderScale, window: FrameWindow, frameMs: readonly number[]): void {
  for (const ms of frameMs) runSecond(state, window, ms)
}

describe('adaptive render scale', () => {
  it('starts at 0.75 on a 4K output with a floor of 0.5, a 1920 x 1080 internal render (#38)', () => {
    const state = createRenderScale(AT_4K)
    expect(state.scale).toBe(0.75)
    expect(state.floor).toBe(0.5)
  })

  it('never renders under 1080 pixels across the short axis, so a 1080p output stays native', () => {
    expect(createRenderScale(AT_1080P).scale).toBe(1)
    expect(createRenderScale({ cssPixels: 800, devicePixels: 800 }).scale).toBe(1)
    expect(
      renderScaleFloorOf({ cssPixels: 1440, devicePixels: 1440 }) * 1440,
    ).toBeGreaterThanOrEqual(1080)
  })

  it('floors a high-DPR screen under 1080 CSS pixels at one internal pixel per CSS pixel (#173)', () => {
    expect(renderScaleFloorOf(PHONE_LANDSCAPE)).toBe(0.5)
    expect(renderScaleFloorOf({ cssPixels: 820, devicePixels: 1640 })).toBe(0.5)
    expect(renderScaleFloorOf({ cssPixels: 900, devicePixels: 1800 })).toBe(0.5)
  })

  it('keeps the 4K TV and the 1440p desktop at the 1080p floor whatever their DPR (#173 tiers)', () => {
    expect(renderScaleFloorOf({ cssPixels: 1080, devicePixels: 2160 })).toBe(0.5)
    expect(renderScaleFloorOf({ cssPixels: 1440, devicePixels: 1440 })).toBe(0.75)
  })

  it('pins a phone at its floor of 0.5 instead of holding it at a native render', () => {
    const state = createRenderScale(PHONE_LANDSCAPE)
    pinRenderScale(state, 0.5)
    expect(state.scale).toBe(0.5)
  })

  it('steps down 0.1 per second of missed frames and stops at the floor', () => {
    const state = createRenderScale(AT_4K)
    const window = createFrameWindow()
    runSecond(state, window, 33)
    expect(state.scale).toBe(0.65)
    runSeconds(state, window, [33, 33, 33, 33])
    expect(state.scale).toBe(0.5)
  })

  it('steps up 0.1 per second that met every frame and stops at a native render', () => {
    const state = createRenderScale(AT_4K)
    const window = createFrameWindow()
    runSeconds(state, window, [16.6, 16.6, 16.6, 16.6])
    expect(state.scale).toBe(1)
  })

  it('takes the same seconds to climb at 60 and 144 frames per second', () => {
    const at60 = createRenderScale(AT_4K)
    const at144 = createRenderScale(AT_4K)
    runSeconds(at60, createFrameWindow(), [16.6, 16.6])
    runSeconds(at144, createFrameWindow(), [6.9, 6.9])
    expect(at60.scale).toBe(0.95)
    expect(at144.scale).toBe(at60.scale)
  })

  it('holds while the p95 frame sits between meeting and missing the budget', () => {
    const state = createRenderScale(AT_4K)
    runSecond(state, createFrameWindow(), 18)
    expect(state.scale).toBe(0.75)
  })

  it('settles at the lower scale after it has swung back and forth three times', () => {
    const state = createRenderScale(AT_4K)
    const window = createFrameWindow()
    runSeconds(state, window, [16.6, 33, 16.6, 33])
    expect(state.isSettled).toBe(true)
    const settled = state.scale
    runSeconds(state, window, [16.6, 16.6, 33])
    expect(state.scale).toBe(settled)
    expect(settled).toBe(0.75)
  })

  it('stays where it is pinned, inside the floor and 1, until unpinned', () => {
    const state = createRenderScale(AT_4K)
    const window = createFrameWindow()
    pinRenderScale(state, 0.2)
    expect(state.scale).toBe(0.5)
    pinRenderScale(state, 1)
    runSeconds(state, window, [33, 33])
    expect(state.scale).toBe(1)
    pinRenderScale(state, null)
    runSecond(state, window, 33)
    expect(state.scale).toBe(0.9)
  })

  it('lifts the scale onto a higher floor when the output shrinks', () => {
    const state = createRenderScale(AT_4K)
    runSeconds(state, createFrameWindow(), [33, 33, 33])
    refloorRenderScale(state, AT_1080P)
    expect(state.scale).toBe(1)
  })
})

/** Settles a 4K output at 0.75 after three reversals (as the #38 settle test does). */
function settledAt4k(window: FrameWindow): RenderScale {
  const state = createRenderScale(AT_4K)
  runSeconds(state, window, [16.6, 33, 16.6, 33])
  return state
}

describe('render scale hysteresis (TD #470 section 2.4, ticket 477)', () => {
  it('draws only the floor, the ceiling or halfway, so most steps reallocate no target', () => {
    const state = createRenderScale(PHONE_LANDSCAPE)
    const window = createFrameWindow()
    const drawn = new Set<number>()
    for (let second = 0; second < 6; second++) {
      runSecond(state, window, 33)
      drawn.add(drawnRenderScaleOf(state))
    }
    for (let second = 0; second < 6; second++) {
      runSecond(state, window, 16.6)
      drawn.add(drawnRenderScaleOf(state))
    }
    expect([...drawn].sort()).toEqual([0.5, 0.75, 1])
  })

  it('draws a pinned scale exactly', () => {
    const state = createRenderScale(AT_4K)
    pinRenderScale(state, 0.62)
    expect(drawnRenderScaleOf(state)).toBe(0.62)
  })

  it('steps at most every 2 s once it has settled and adapts again a minute later', () => {
    const window = createFrameWindow()
    const state = settledAt4k(window)
    runSeconds(
      state,
      window,
      Array.from({ length: 59 }, () => 16.6),
    )
    expect(state.isSettled).toBe(true)
    expect(state.scale).toBe(0.75)
    runSecond(state, window, 16.6)
    expect(state.isSettled).toBe(false)
    expect(state.scale).toBe(0.85)
    runSecond(state, window, 16.6)
    expect(state.scale).toBe(0.85)
    runSecond(state, window, 16.6)
    expect(state.scale).toBe(0.95)
  })

  it('never climbs past the quality cap, and the cap never sinks under the floor', () => {
    const state = createRenderScale(AT_4K)
    capRenderScale(state, 0.75)
    runSeconds(state, createFrameWindow(), [16.6, 16.6, 16.6])
    expect(state.scale).toBe(0.75)
    capRenderScale(state, 0.2)
    expect(state.ceiling).toBe(0.5)
    expect(state.scale).toBe(0.5)
  })

  it('judges a second against the budget it is given, as a 30 fps cap needs', () => {
    const state = createRenderScale(AT_4K)
    const window = createFrameWindow()
    let verdict = null
    // 31 frames: thirty float thirtieths can sum just short of a second.
    for (let frame = 0; frame < 31; frame++) {
      addFrame(window, 1 / 30)
      verdict = adaptRenderScale(state, window, 1000 / 30) ?? verdict
    }
    expect(verdict).toBe('met')
    expect(state.scale).toBe(0.85)
  })

  it('has nothing left to give once it sits at its floor', () => {
    const state = createRenderScale(AT_4K)
    expect(isRenderScaleAtFloor(state)).toBe(false)
    runSeconds(state, createFrameWindow(), [33, 33, 33])
    expect(isRenderScaleAtFloor(state)).toBe(true)
  })
})

describe('frame window', () => {
  it('reads the p50 and p95 frame of the window', () => {
    const window = createFrameWindow()
    for (let frame = 1; frame <= 100; frame++) addFrame(window, frame / 1000)
    expect(frameMsAt(window, 0.5)).toBeCloseTo(50, 3)
    expect(frameMsAt(window, 0.95)).toBeCloseTo(95, 3)
  })
})
