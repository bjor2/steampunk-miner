import { describe, expect, it } from 'vitest'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import {
  cameraViewOf,
  easeViewShortAxis,
  pixelsPerMetreOf,
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
