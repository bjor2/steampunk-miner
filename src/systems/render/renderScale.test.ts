import { describe, expect, it } from 'vitest'
import { addFrame, createFrameWindow, frameMsAt, type FrameWindow } from './frameWindow'
import {
  adaptRenderScale,
  createRenderScale,
  pinRenderScale,
  refloorRenderScale,
  renderScaleFloorOf,
  type RenderScale,
} from './renderScale'

const AT_4K = 2160
const AT_1080P = 1080

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
    expect(createRenderScale(800).scale).toBe(1)
    expect(renderScaleFloorOf(1440) * 1440).toBeGreaterThanOrEqual(1080)
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

describe('frame window', () => {
  it('reads the p50 and p95 frame of the window', () => {
    const window = createFrameWindow()
    for (let frame = 1; frame <= 100; frame++) addFrame(window, frame / 1000)
    expect(frameMsAt(window, 0.5)).toBeCloseTo(50, 3)
    expect(frameMsAt(window, 0.95)).toBeCloseTo(95, 3)
  })
})
