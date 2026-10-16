import { describe, expect, it } from 'vitest'
import { deferToNextFrame, type FrameScheduler } from './screenHooks'

/** Frames the test steps by hand: `next()` runs what is due on the coming frame. */
function handFrames(): FrameScheduler & { next(): void } {
  let count = 0
  const due = new Map<number, () => void>()
  return {
    requestFrame: (callback) => {
      count += 1
      due.set(count, callback)
      return count
    },
    cancelFrame: (frame) => due.delete(frame),
    next: () => {
      const running = [...due.values()]
      due.clear()
      running.forEach((callback) => callback())
    },
  }
}

describe('screen changes (ticket 483)', () => {
  it('lays the screen out once on the frame after a burst of resizes, not once per resize', () => {
    const frames = handFrames()
    let fits = 0
    const settled = deferToNextFrame(() => (fits += 1), frames)
    settled.request()
    settled.request()
    settled.request()
    expect(fits).toBe(0)
    frames.next()
    expect(fits).toBe(1)
    frames.next()
    expect(fits).toBe(1)
  })

  it('lays the screen out again for a resize that comes after the frame, as a late iOS one does', () => {
    const frames = handFrames()
    let fits = 0
    const settled = deferToNextFrame(() => (fits += 1), frames)
    settled.request()
    frames.next()
    settled.request()
    frames.next()
    expect(fits).toBe(2)
  })

  it('drops a pending layout once unsubscribed', () => {
    const frames = handFrames()
    let fits = 0
    const settled = deferToNextFrame(() => (fits += 1), frames)
    settled.request()
    settled.cancel()
    frames.next()
    expect(fits).toBe(0)
  })
})
