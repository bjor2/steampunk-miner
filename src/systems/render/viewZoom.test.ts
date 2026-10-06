import { describe, expect, it } from 'vitest'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import {
  cameraViewOf,
  easeViewShortAxis,
  maxViewShortAxisOf,
  pixelsPerMetreOf,
  shownViewShortAxisOf,
  viewShortAxisProblems,
  zoomedIn,
  zoomedOut,
} from './viewZoom'

function zoomRepeatedly(step: (metres: number) => number, times: number): number {
  let metres = VIEW_SHORT_AXIS_DEFAULT_M
  for (let i = 0; i < times; i++) metres = step(metres)
  return metres
}

function easeFor(seconds: number, stepsPerSecond: number, from: number, to: number): number {
  let metres = from
  for (let i = 0; i < Math.round(seconds * stepsPerSecond); i++) {
    metres = easeViewShortAxis(metres, to, 1 / stepsPerSecond)
  }
  return metres
}

describe('zoom framing', () => {
  it.each([
    [1920, 1080],
    [3840, 2160],
  ])(
    'shows 12 m across the short axis at %i x %i with the collider at 7.5% of it',
    (width, height) => {
      const view = cameraViewOf(width, height, VIEW_SHORT_AXIS_DEFAULT_M)
      expect(view.viewShortAxisMetres).toBe(12)
      expect(view.vehicleColliderShare).toBeCloseTo(0.075, 3)
      expect(view.pixelsPerMetre * 12).toBe(height)
    },
  )

  it('frames the same world at 1080p and 4K, only sharper', () => {
    const fullHd = pixelsPerMetreOf(1920, 1080, 12)
    const fourK = pixelsPerMetreOf(3840, 2160, 12)
    expect(fourK).toBe(fullHd * 2)
    expect(fourK).toBe(180)
  })

  it('measures the shorter side, so a portrait window frames by its width', () => {
    expect(pixelsPerMetreOf(800, 1280, 8)).toBe(100)
  })

  it('steps by a factor of 1.25 per zoom action', () => {
    expect(zoomedOut(12)).toBeCloseTo(15, 9)
    expect(zoomedIn(12)).toBeCloseTo(9.6, 9)
  })

  it('clamps zooming in at 8 m and zooming out at 20 m', () => {
    expect(zoomRepeatedly(zoomedIn, 10)).toBe(8)
    expect(zoomRepeatedly(zoomedOut, 10)).toBe(20)
  })

  it('accepts a view from 8 m to 20 m and refuses anything else', () => {
    expect(viewShortAxisProblems(8)).toEqual([])
    expect(viewShortAxisProblems(20)).toEqual([])
    expect(viewShortAxisProblems(7.99)).toHaveLength(1)
    expect(viewShortAxisProblems(21)).toHaveLength(1)
    expect(viewShortAxisProblems('12')).toHaveLength(1)
    expect(viewShortAxisProblems(Number.NaN)).toHaveLength(1)
  })

  it('eases a zoom step within 0.2 s and lands on the target', () => {
    expect(easeFor(0.2, 60, 12, 15)).toBeCloseTo(15, 0)
    expect(easeFor(1, 60, 12, 15)).toBe(15)
  })

  it('eases the same at 30 and 144 frames per second', () => {
    expect(easeFor(1 / 6, 30, 12, 20)).toBeCloseTo(easeFor(1 / 6, 144, 12, 20), 9)
  })
})

describe('zoom cap by screen shape', () => {
  it.each([
    ['16:9', 1920, 1080, 20],
    ['16:10', 1280, 800, 20],
    ['4:3', 1024, 768, 20],
    ['21:9', 2560, 1080, 15.86],
    ['19.5:9', 1950, 900, 17.1],
    ['20:9', 2000, 900, 16.74],
  ])(
    'lets a %s screen zoom out to %s x %s at most %s m (#173 cap table)',
    (_, width, height, cap) => {
      expect(maxViewShortAxisOf(width, height)).toBeCloseTo(cap, 2)
    },
  )

  it('keeps the half diagonal of the widest view within 20.40 m, the #38 budget', () => {
    for (const [width, height] of [
      [2560, 1080],
      [844, 390],
      [1180, 820],
    ]) {
      const metres = maxViewShortAxisOf(width, height)
      const halfDiagonal = (Math.hypot(width, height) / Math.min(width, height)) * metres * 0.5
      expect(halfDiagonal).toBeLessThanOrEqual(20.4 + 1e-9)
    }
  })

  it('reads a portrait screen like the same landscape one', () => {
    expect(maxViewShortAxisOf(390, 844)).toBe(maxViewShortAxisOf(844, 390))
  })

  it('shows the chosen view under the cap and the cap past it', () => {
    expect(shownViewShortAxisOf(2560, 1080, 12)).toBe(12)
    expect(shownViewShortAxisOf(2560, 1080, 20)).toBeCloseTo(15.86, 2)
    expect(shownViewShortAxisOf(1920, 1080, 20)).toBe(20)
  })

  it('allows the full 20 m zoom-out before the canvas has a size', () => {
    expect(maxViewShortAxisOf(0, 0)).toBe(20)
  })

  it('reports the cap with the framing the debug API reads', () => {
    expect(cameraViewOf(2560, 1080, 12).maxViewShortAxisMetres).toBeCloseTo(15.86, 2)
  })
})
