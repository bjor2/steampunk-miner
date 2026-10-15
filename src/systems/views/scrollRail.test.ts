import { describe, expect, it } from 'vitest'
import { SCROLL_THUMB_MIN_PX } from '../../constants/uiParts'
import { scrollRailOf } from './scrollRail'

// Spec #422 ruling 3 (build #423): the rail's thumb and edge fades from the viewport's metrics.

describe('scroll rail', () => {
  it('shows no thumb and no edge fade while the content fits the viewport', () => {
    expect(scrollRailOf({ viewportPx: 300, contentPx: 300, scrollPx: 0 })).toEqual({
      thumb: null,
      isAtStart: true,
      isAtEnd: true,
    })
    expect(scrollRailOf({ viewportPx: 300, contentPx: 120, scrollPx: 0 }).thumb).toBeNull()
  })

  it('sizes the thumb to the viewport’s share of the content and starts it at the top', () => {
    const rail = scrollRailOf({ viewportPx: 300, contentPx: 900, scrollPx: 0 })
    expect(rail.thumb).toEqual({ offsetPx: 0, lengthPx: 100 })
    expect(rail.isAtStart).toBe(true)
    expect(rail.isAtEnd).toBe(false)
  })

  it('moves the thumb with the scroll and ends it flush with the rail at the bottom', () => {
    const half = scrollRailOf({ viewportPx: 300, contentPx: 900, scrollPx: 300 })
    expect(half.thumb).toEqual({ offsetPx: 100, lengthPx: 100 })
    expect(half.isAtStart).toBe(false)
    expect(half.isAtEnd).toBe(false)
    const end = scrollRailOf({ viewportPx: 300, contentPx: 900, scrollPx: 600 })
    expect(end.thumb!.offsetPx + end.thumb!.lengthPx).toBe(300)
    expect(end.isAtEnd).toBe(true)
  })

  it('keeps the thumb inside the viewport whatever the scroll reads, so the rail never widens it', () => {
    const metrics = { viewportPx: 200, contentPx: 5000 }
    for (const scrollPx of [-50, 0, 1234, 4800, 9999]) {
      const thumb = scrollRailOf({ ...metrics, scrollPx }).thumb!
      expect(thumb.offsetPx).toBeGreaterThanOrEqual(0)
      expect(thumb.offsetPx + thumb.lengthPx).toBeLessThanOrEqual(metrics.viewportPx)
    }
  })

  it('never shrinks the thumb under its minimum on a very long list', () => {
    const thumb = scrollRailOf({ viewportPx: 200, contentPx: 100000, scrollPx: 0 }).thumb!
    expect(thumb.lengthPx).toBe(SCROLL_THUMB_MIN_PX)
  })
})
