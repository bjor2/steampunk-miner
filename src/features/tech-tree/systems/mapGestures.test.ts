import { describe, expect, it } from 'vitest'
import {
  anchoredScrollOf,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  midpointOf,
  pinchZoomOf,
  spanOf,
} from './mapGestures'

describe('tech tree map pinch', () => {
  it('scales the map by how far the fingers spread', () => {
    expect(pinchZoomOf(1, 100, 150)).toBeCloseTo(1.5)
    expect(pinchZoomOf(1.5, 200, 100)).toBe(MAP_ZOOM_MIN)
  })

  it('never shrinks the map below its laid-out size nor grows it past twice that', () => {
    expect(pinchZoomOf(1, 100, 20)).toBe(MAP_ZOOM_MIN)
    expect(pinchZoomOf(1, 100, 900)).toBe(MAP_ZOOM_MAX)
    expect(MAP_ZOOM_MIN).toBe(1)
  })

  it('keeps the zoom when the fingers started on one point', () => {
    expect(pinchZoomOf(1.25, 0, 80)).toBe(1.25)
  })

  it('measures the spread and the midpoint of two fingers', () => {
    expect(spanOf({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(50)
    expect(midpointOf({ x: 10, y: 20 }, { x: 30, y: 60 })).toEqual({ x: 20, y: 40 })
  })

  it('keeps the map point under the fingers in place as it scales', () => {
    const scroll = 300
    const focal = 100
    const ratio = 1.5
    const next = anchoredScrollOf(scroll, focal, ratio)
    expect((next + focal) / ratio).toBeCloseTo(scroll + focal)
  })

  it('never scrolls before the start of the map', () => {
    expect(anchoredScrollOf(0, 200, 0.5)).toBe(0)
  })
})
