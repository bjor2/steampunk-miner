import { describe, expect, it } from 'vitest'
import { CAMERA_FOLLOW } from '../../constants/scene'
import {
  createCameraFollow,
  followLagOf,
  followPointInto,
  followWeightOf,
  snapCameraFollow,
  stepCameraFollow,
  type CameraFollow,
} from './cameraFollow'

/** A whole number of frames at 30, 60 and 144 frames per second. */
const SIXTH_SECOND = 1 / 6

/** Drives the body along +x at `speed` m/s for `seconds` at `framesPerSecond`, from x = 0. */
function followAfter(seconds: number, framesPerSecond: number, speed: number) {
  const follow = createCameraFollow()
  const body = { x: 0, y: 0 }
  stepCameraFollow(follow, body, 1 / framesPerSecond)
  const frames = Math.round(seconds * framesPerSecond)
  for (let frame = 1; frame <= frames; frame++) {
    body.x = (speed * frame) / framesPerSecond
    stepCameraFollow(follow, body, 1 / framesPerSecond)
  }
  return { follow, body }
}

/** Where the eased point is `seconds` after the body sits 1.5 m from it, at `framesPerSecond`. */
function settleAfter(seconds: number, framesPerSecond: number): number {
  const follow = primedAt(0, 0)
  for (let frame = 0; frame < Math.round(seconds * framesPerSecond); frame++) {
    stepCameraFollow(follow, { x: 1.5, y: 0 }, 1 / framesPerSecond)
  }
  return follow.x
}

function primedAt(x: number, y: number): CameraFollow {
  const follow = createCameraFollow()
  snapCameraFollow(follow, { x, y })
  return follow
}

describe('camera follow', () => {
  it('trails a steady drive by speed times tau', () => {
    const { follow, body } = followAfter(2, 1000, 1.5)
    expect(body.x - follow.x).toBeCloseTo(1.5 * CAMERA_FOLLOW.easeSeconds, 2)
  })

  it('shows the whole ease at 2 m/s and none of it at 3 m/s', () => {
    expect(followWeightOf(2)).toBe(1)
    expect(followWeightOf(0)).toBe(1)
    expect(followWeightOf(2.5)).toBeCloseTo(0.5, 9)
    expect(followWeightOf(3)).toBe(0)
    expect(followWeightOf(10)).toBe(0)
  })

  it('follows the body itself at 3 m/s, where the lean starts', () => {
    const follow = primedAt(0, 0)
    const point = followPointInto({ x: 0, y: 0 }, follow, { x: 1, y: 0.5 }, 3)
    expect(point).toEqual({ x: 1, y: 0.5 })
  })

  it('snaps to the body on a 3 m step instead of easing across it', () => {
    const follow = primedAt(0, 0)
    stepCameraFollow(follow, { x: 3, y: 0 }, 1 / 60)
    expect(follow).toMatchObject({ x: 3, y: 0 })
  })

  it('eases across a step under 2 m', () => {
    const follow = primedAt(0, 0)
    stepCameraFollow(follow, { x: 1, y: 0 }, 1 / 60)
    expect(follow.x).toBeGreaterThan(0)
    expect(follow.x).toBeLessThan(1)
  })

  it('lands on the body on its first frame', () => {
    const follow = createCameraFollow()
    stepCameraFollow(follow, { x: 0.5, y: -0.25 }, 1 / 60)
    expect(follow).toEqual({ x: 0.5, y: -0.25, primed: true })
  })

  it('closes the same share of a held gap at 30, 60 and 144 frames per second', () => {
    const at60 = settleAfter(SIXTH_SECOND, 60)
    expect(settleAfter(SIXTH_SECOND, 30)).toBeCloseTo(at60, 3)
    expect(settleAfter(SIXTH_SECOND, 144)).toBeCloseTo(at60, 3)
    expect(at60).toBeCloseTo(1.5 * (1 - Math.exp(-SIXTH_SECOND / CAMERA_FOLLOW.easeSeconds)), 9)
  })

  it('keeps a still body still, with no lag at rest', () => {
    const follow = primedAt(4, 7)
    const body = { x: 4, y: 7 }
    const point = { x: 0, y: 0 }
    for (let frame = 0; frame < 120; frame++) stepCameraFollow(follow, body, 1 / 60)
    followPointInto(point, follow, body, 0)
    expect(point).toEqual(body)
    expect(followLagOf(point, body)).toBe(0)
  })

  it('writes into the state and the point it is given, allocating nothing a frame', () => {
    const follow = primedAt(0, 0)
    const point = { x: 0, y: 0 }
    stepCameraFollow(follow, { x: 0.1, y: 0 }, 1 / 60)
    expect(followPointInto(point, follow, { x: 0.1, y: 0 }, 1)).toBe(point)
    expect(Object.keys(follow)).toEqual(['x', 'y', 'primed'])
  })
})
