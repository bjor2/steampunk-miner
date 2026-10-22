import { describe, expect, it } from 'vitest'
import { frontLoweredTo, type CutFront } from './cutFront'
import { MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'
import { boreWallTargetOf, FULL_WEIGHT, type WeightedSample } from './stampShape'

// The swept cut's front on the 1.2 m bore (GD lock on #662): the face's side at the wall is cut a
// sample further on than the face, and an open wall sample the last front crossed follows a body
// sliding aside only in steps of half the side clearance, never its millimetre drift.

/** A front at x = 10 m moving +x, its rear 5 m back, the last front 1 m behind it. */
const FRONT: CutFront = {
  xMm: 10_000,
  yMm: 0,
  aheadX: 1024,
  aheadY: 0,
  rear: { xMm: 5_000, yMm: 0 },
  radiusMm: 600,
  floorRadiusMm: null,
  crossed: { xMm: 9_000, yMm: 0 },
}

/** A sample at (x, y) mm with the bore's weight there, its floor the wall's ramp as stamps give it. */
function sampleAt(xMm: number, yMm: number, weight: number): WeightedSample {
  const floor = weight < FULL_WEIGHT ? boreWallTargetOf(weight) : 0
  return { sx: xMm / MM_PER_SAMPLE, sy: yMm / MM_PER_SAMPLE, weight, floor }
}

describe('swept cut front at the bore wall (ticket 662)', () => {
  it('cuts the face a sample further on beside the wall than on its line', () => {
    const onLine = sampleAt(10_000, 0, FULL_WEIGHT)
    const atWall = sampleAt(10_000, 500, FULL_WEIGHT)
    expect(frontLoweredTo(onLine, FRONT, SOLID_DENSITY)).toBe(SOLID_DENSITY)
    expect(frontLoweredTo(atWall, FRONT, SOLID_DENSITY)).toBeLessThan(SOLID_DENSITY)
  })

  it('holds an open crossed wall sample against a fall under half the side clearance', () => {
    const wall = sampleAt(8_500, 500, 200)
    expect(frontLoweredTo(wall, FRONT, 100)).toBe(100)
  })

  it('lets an open crossed wall sample follow a slide of half the clearance or more', () => {
    const wall = sampleAt(8_500, 500, 250)
    expect(frontLoweredTo(wall, FRONT, 100)).toBe(boreWallTargetOf(250))
  })

  it('lowers a solid crossed wall sample at once, the wall the body meets', () => {
    const wall = sampleAt(8_500, 500, 200)
    expect(frontLoweredTo(wall, FRONT, 140)).toBe(boreWallTargetOf(200))
  })

  it('clears the bore’s full-weight core behind the last front however little is left', () => {
    expect(frontLoweredTo(sampleAt(8_500, 0, FULL_WEIGHT), FRONT, 5)).toBe(0)
  })
})
