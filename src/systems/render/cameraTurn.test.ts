import { describe, expect, it } from 'vitest'
import {
  angleOfUp,
  createCameraTurn,
  easeAngleToward,
  isCameraMode,
  stepCameraTurn,
  type CameraMode,
} from './cameraTurn'

/** Runs the camera for `seconds` at `stepsPerSecond` with the vehicle held at `position`. */
function turnAfter(
  seconds: number,
  stepsPerSecond: number,
  position: { x: number; y: number },
  mode: CameraMode,
) {
  const turn = createCameraTurn()
  for (let step = 0; step < seconds * stepsPerSecond; step++) {
    stepCameraTurn(turn, position, mode, 1 / stepsPerSecond)
  }
  return turn
}

const EAST_SURFACE = { x: 290, y: 0 }

describe('camera turn', () => {
  it('puts local down at the bottom of the screen once it has settled', () => {
    const turn = turnAfter(5, 60, EAST_SURFACE, 'rotating')
    expect(turn.angle).toBeCloseTo(angleOfUp({ x: 1, y: 0 }), 6)
    expect(turn.angle).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('turns the same at 30 and 144 frames per second', () => {
    const slow = turnAfter(0.5, 30, EAST_SURFACE, 'rotating').angle
    const fast = turnAfter(0.5, 144, EAST_SURFACE, 'rotating').angle
    expect(fast).toBeCloseTo(slow, 9)
    expect(slow).not.toBeCloseTo(-Math.PI / 2, 2)
  })

  it('stays upright in the fixed-camera mode wherever the vehicle is', () => {
    expect(turnAfter(2, 60, EAST_SURFACE, 'fixed').angle).toBe(0)
    expect(turnAfter(2, 60, { x: 0, y: -290 }, 'fixed').angle).toBe(0)
  })

  it('turns the short way round across the half turn', () => {
    const eased = easeAngleToward(3, -3, 1 / 60)
    expect(eased).toBeGreaterThan(3)
  })

  it('keeps its last up near the planet centre, where up is undefined', () => {
    const turn = turnAfter(5, 60, EAST_SURFACE, 'rotating')
    stepCameraTurn(turn, { x: 0.2, y: -0.1 }, 'rotating', 1)
    expect(turn.up).toEqual({ x: 1, y: 0 })
    expect(turn.angle).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('knows its two modes and nothing else', () => {
    expect(isCameraMode('rotating')).toBe(true)
    expect(isCameraMode('fixed')).toBe(true)
    expect(isCameraMode('spinning')).toBe(false)
  })
})
