import { describe, expect, it } from 'vitest'
import {
  distanceOffPath,
  isSameHeading,
  pathEndOf,
  progressAlongPath,
  stripPathFrom,
  writePathPoint,
} from './stripPath'

const NOSE = { x: 0, y: 250 }
const RIGHT = { x: 1, y: 0 }
const DOWN = { x: 0, y: -1 }
const DOWN_RIGHT = { x: Math.SQRT1_2, y: -Math.SQRT1_2 }

function pointAt(facing: { x: number; y: number }, s: number) {
  return writePathPoint(stripPathFrom(NOSE, facing), s, { x: 0, y: 0 })
}

describe('strip path', () => {
  it('goes straight down a radius when the drill faces down', () => {
    const point = pointAt(DOWN, 100)
    expect(point.x).toBeCloseTo(0, 9)
    expect(point.y).toBeCloseTo(150, 9)
  })

  it('keeps its depth round the planet when the drill faces level', () => {
    const point = pointAt(RIGHT, 300)
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(250, 9)
    expect(Math.atan2(point.y, point.x)).toBeCloseTo(Math.PI / 2 - 300 / 250, 9)
  })

  it('loses a metre of radius every 1.41 m on a diagonal, as the drill keeps its angle', () => {
    const point = pointAt(DOWN_RIGHT, 100)
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(250 - 100 * Math.SQRT1_2, 9)
  })

  it.each([
    ['down', DOWN],
    ['level', RIGHT],
    ['diagonal', DOWN_RIGHT],
  ])('measures how far along the %s path a point on it lies', (_name, facing) => {
    const path = stripPathFrom(NOSE, facing)
    const point = writePathPoint(path, 77, { x: 0, y: 0 })
    expect(progressAlongPath(path, point)).toBeCloseTo(77, 6)
    expect(distanceOffPath(path, point, { x: 0, y: 0 })).toBeCloseTo(0, 6)
  })

  it('ends where it leaves the planet, short of the centre, or after one lap', () => {
    expect(pathEndOf(stripPathFrom(NOSE, { x: 0, y: 1 }), 300)).toBeCloseTo(50, 9)
    expect(pathEndOf(stripPathFrom(NOSE, DOWN), 300)).toBeCloseTo(249.5, 9)
    expect(pathEndOf(stripPathFrom(NOSE, RIGHT), 300)).toBeCloseTo(2 * Math.PI * 250, 6)
  })

  it('sees a turn as a new heading, and a level dig round the planet as the same one', () => {
    const path = stripPathFrom(NOSE, RIGHT)
    const further = writePathPoint(path, 100, { x: 0, y: 0 })
    const levelThere = { x: further.y / 250, y: -further.x / 250 }
    expect(isSameHeading(path, further, levelThere)).toBe(true)
    expect(isSameHeading(path, NOSE, DOWN)).toBe(false)
  })
})
