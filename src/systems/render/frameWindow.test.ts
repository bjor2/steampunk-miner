import { describe, expect, it } from 'vitest'
import { LONG_FRAME_MS } from '../../constants/scene'
import { addFrame, countFramesOver, createFrameWindow, frameMsAt } from './frameWindow'

/** One second at 60 frames/s with `hitches` frames of `hitchMs` among them. */
function secondWithHitches(hitches: number, hitchMs: number) {
  const window = createFrameWindow()
  for (let frame = 0; frame < 60 - hitches; frame++) addFrame(window, 1 / 60)
  for (let frame = 0; frame < hitches; frame++) addFrame(window, hitchMs / 1000)
  return window
}

describe('frame window', () => {
  it('reads the p99 frame of a second as its slowest frame when fewer than 100 frames came in', () => {
    const window = secondWithHitches(1, 80)
    expect(frameMsAt(window, 0.99)).toBeCloseTo(80, 3)
    expect(frameMsAt(window, 0.95)).toBeCloseTo(1000 / 60, 3)
  })

  it('counts the frames of a second that took longer than a long task (#121)', () => {
    expect(countFramesOver(secondWithHitches(3, 51), LONG_FRAME_MS)).toBe(3)
  })

  it('does not count a frame of exactly 50 ms as long', () => {
    expect(countFramesOver(secondWithHitches(2, 50), LONG_FRAME_MS)).toBe(0)
  })

  it('counts nothing in an empty window', () => {
    expect(countFramesOver(createFrameWindow(), LONG_FRAME_MS)).toBe(0)
  })
})
