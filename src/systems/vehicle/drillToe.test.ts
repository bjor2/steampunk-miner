import { describe, expect, it } from 'vitest'
import { CELL_KIND } from '../world/worldCell'
import { drillContactOf, inTheWayMmOf } from './drillContact'
import { drillStampOf } from './drillStamp'
import { solidToeAheadOf, type ToeGround } from './drillToe'
import { FACING, facingVectorOf, type Facing, type VehiclePose } from './vehiclePose'

// A body facing right with its wheel line on sample row 40 (y 10 000 mm) and its face on x 10 450
// mm; samples sit every 250 mm, so sample column 42 is 50 mm past the face and 43 is 300 mm past.
const POSE: VehiclePose = {
  x: 10_000,
  y: 10_450,
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  facing: FACING.right,
}
const REACH_MM = inTheWayMmOf(0)
const WHEEL_ROW = 40
const SOLID = 255

/** A flat floor whose surface row reads `surface`, with `extra` samples set over it. */
function groundOf(extra: readonly [number, number, number][] = [], surface = 128): ToeGround {
  const placed = new Map(extra.map(([sx, sy, density]) => [`${sx},${sy}`, density]))
  return {
    densityAt: (sx, sy) => placed.get(`${sx},${sy}`) ?? floorDensityAt(sy, surface),
  }
}

/** Open air with only `extra` samples set. */
function airOf(extra: readonly [number, number, number][]): ToeGround {
  const placed = new Map(extra.map(([sx, sy, density]) => [`${sx},${sy}`, density]))
  return { densityAt: (sx, sy) => placed.get(`${sx},${sy}`) ?? 0 }
}

function floorDensityAt(sy: number, surface: number): number {
  if (sy < WHEEL_ROW) return SOLID
  return sy === WHEEL_ROW ? surface : 0
}

function facing(direction: Facing): VehiclePose {
  return { ...POSE, facing: direction }
}

describe("the face's toe (ticket 491)", () => {
  it('a wedge of blended-solid ground over the wheel line ahead of the front counts as the face', () => {
    const wedge = groundOf([
      [42, 41, SOLID],
      [43, 41, SOLID],
      [43, 42, SOLID],
    ])
    expect(solidToeAheadOf(wedge, POSE, REACH_MM)).toBe(true)
  })

  it('flat floor under the front is never the toe', () => {
    for (const surface of [100, 128, 160, 200, 250]) {
      expect(solidToeAheadOf(groundOf([], surface), POSE, REACH_MM)).toBe(false)
      expect(solidToeAheadOf(groundOf([], surface), POSE, 2_000)).toBe(false)
    }
  })

  it('solid ground behind the front or past the in-the-way reach is not the toe', () => {
    const behind = groundOf([
      [40, 42, SOLID],
      [41, 42, SOLID],
    ])
    const past = groundOf([[44, 42, SOLID]])
    expect(solidToeAheadOf(behind, POSE, REACH_MM)).toBe(false)
    expect(solidToeAheadOf(past, POSE, REACH_MM)).toBe(false)
    expect(solidToeAheadOf(past, POSE, 600)).toBe(true)
  })

  it('a toe under the single-sample bar (below 128 samples, blended 128 or more) is found', () => {
    // Every sample inside the box reads under 128; the solid one sits 300 mm past the face, out of
    // the contact rule's 250 mm, and the blend toward it is solid inside the box. No floor, which
    // the contact rule would count as ground to cut in the way.
    const toe = airOf([
      [42, 41, 100],
      [42, 42, 100],
      [43, 42, SOLID],
    ])
    const aim = {
      centreMm: POSE,
      facing: facingVectorOf(POSE.upx, POSE.upy, POSE.facing),
      stamp: drillStampOf(POSE, false),
      inTheWayMm: REACH_MM,
    }
    const drillable = { ...toe, materialAt: () => CELL_KIND.ground }
    expect(drillContactOf(drillable, aim)).not.toBe('inTheWay')
    expect(solidToeAheadOf(toe, POSE, REACH_MM)).toBe(true)
  })

  it('the same pose and ground always give the same answer (integer only)', () => {
    const tilted: VehiclePose = { ...POSE, upx: 178, upy: 1008 }
    const reads: number[] = []
    const wedge = groundOf([
      [42, 41, SOLID],
      [43, 42, SOLID],
    ])
    const counted: ToeGround = {
      densityAt: (sx, sy) => {
        reads.push(sx, sy)
        return wedge.densityAt(sx, sy)
      },
    }
    for (const pose of [POSE, facing(FACING.left), tilted]) {
      const first = solidToeAheadOf(counted, pose, REACH_MM)
      expect(solidToeAheadOf(counted, pose, REACH_MM)).toBe(first)
    }
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every(Number.isInteger)).toBe(true)
  })

  it('only a level facing has a toe', () => {
    const wedge = groundOf([[42, 41, SOLID]])
    expect(solidToeAheadOf(wedge, facing(FACING.down), REACH_MM)).toBe(false)
    expect(solidToeAheadOf(wedge, facing(FACING.up), REACH_MM)).toBe(false)
  })
})
