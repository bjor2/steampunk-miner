import { describe, expect, it } from 'vitest'
import { SOLID_DENSITY } from '../world/sampleGrid'
import { CELL_KIND } from '../world/worldCell'
import {
  drillContactOf,
  inTheWayMmOf,
  levelSliverDrillContactOf,
  sweptDrillContactOf,
  type DrillableGround,
} from './drillContact'
import { drillStampOf } from './drillStamp'
import { FACING, facingVectorOf, type VehiclePose } from './vehiclePose'

// What the drill bites on, facing left on open ground with one solid sample placed by the spec.
const POSE: VehiclePose = { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.left }
const AIM = {
  centreMm: { x: POSE.x, y: POSE.y },
  facing: facingVectorOf(POSE.upx, POSE.upy, POSE.facing),
  stamp: drillStampOf(POSE, true),
}

/** Open ground with solid samples only at `solid` (sample coordinates). */
function groundWith(solid: readonly [number, number][]): DrillableGround {
  const keys = new Set(solid.map(([sx, sy]) => `${sx},${sy}`))
  return {
    densityAt: (sx, sy) => (keys.has(`${sx},${sy}`) ? SOLID_DENSITY : 0),
    materialAt: () => CELL_KIND.ground,
  }
}

describe('swept drill contact (ticket 330)', () => {
  it('bites on a lip past the face that the per-report rule does not see', () => {
    // 1.25 m ahead and 0.5 m down: past the face's reach and outside the stamp's full-weight core.
    const lip = groundWith([[-5, -2]])
    expect(drillContactOf(lip, AIM)).toBe('none')
    expect(sweptDrillContactOf(lip, AIM)).toBe('ahead')
  })

  it('keeps the per-report answer wherever that rule bites', () => {
    const inTheWay = groundWith([[-2, 0]])
    expect(sweptDrillContactOf(inTheWay, AIM)).toBe(drillContactOf(inTheWay, AIM))
  })

  it('never bites on ground behind the face', () => {
    expect(sweptDrillContactOf(groundWith([[1, -1]]), AIM)).toBe('none')
    expect(sweptDrillContactOf(groundWith([]), AIM)).toBe('none')
  })
})

describe('level sliver contact, the shipped rule with the swept cut off (ticket 516)', () => {
  // On a planet's surface 100 m out, so the level cut's floor sits at the wheels.
  const SURFACE = 100_000
  const aimOf = (facing: VehiclePose['facing']) => {
    const pose: VehiclePose = { x: 0, y: SURFACE, vx: 0, vy: 0, upx: 0, upy: 1024, facing }
    return {
      centreMm: { x: pose.x, y: pose.y },
      facing: facingVectorOf(pose.upx, pose.upy, pose.facing),
      stamp: drillStampOf(pose, false),
    }
  }
  const SURFACE_ROW = SURFACE / 250

  it('bites on a lip past the face of a level cut that the per-report rule does not see', () => {
    // 1.25 m ahead at the centre's height: past the face's reach and outside the full-weight core.
    const lip = groundWith([[-5, SURFACE_ROW]])
    expect(drillContactOf(lip, aimOf(FACING.left))).toBe('none')
    expect(levelSliverDrillContactOf(lip, aimOf(FACING.left))).toBe('ahead')
  })

  it('keeps the per-report rule on a cut down, where no level leg rests on a lip', () => {
    const lip = groundWith([[0, SURFACE_ROW - 5]])
    expect(sweptDrillContactOf(lip, aimOf(FACING.down))).toBe('ahead')
    expect(levelSliverDrillContactOf(lip, aimOf(FACING.down))).toBe('none')
  })

  it('keeps the per-report answer wherever that rule bites', () => {
    const inTheWay = groundWith([[-2, SURFACE_ROW]])
    expect(levelSliverDrillContactOf(inTheWay, aimOf(FACING.left))).toBe('inTheWay')
  })
})

describe('in-the-way window (ticket 334)', () => {
  // Facing left, the face is 450 mm left of the centre; sample -3 sits 750 mm out, 300 past it.
  const past300 = groundWith([[-3, 0]])

  it('holds the wheels for ground up to 250 mm past the face by default', () => {
    expect(drillContactOf(past300, AIM)).not.toBe('inTheWay')
    expect(drillContactOf(groundWith([[-2, 0]]), AIM)).toBe('inTheWay')
  })

  it('widens to the cutting step bound, never under 250 mm', () => {
    expect(inTheWayMmOf(100)).toBe(250)
    expect(inTheWayMmOf(1300)).toBe(1300)
    expect(drillContactOf(past300, { ...AIM, inTheWayMm: inTheWayMmOf(300) })).toBe('inTheWay')
  })
})
