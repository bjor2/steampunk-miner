import { describe, expect, it } from 'vitest'
import { SOLID_DENSITY } from '../world/sampleGrid'
import { CELL_KIND } from '../world/worldCell'
import {
  drillContactOf,
  inTheWayMmOf,
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
    // 1 m ahead and 0.5 m down: past the face's reach and in the stamp's wall band, not its core.
    const lip = groundWith([[-4, -2]])
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

describe('swept contact on the narrow bore, both cut paths (GD lock on #662)', () => {
  // On a planet's surface 100 m out, facing down: the face lies 450 mm under the centre.
  const SURFACE = 100_000
  const SURFACE_ROW = SURFACE / 250
  const pose: VehiclePose = {
    x: 0,
    y: SURFACE,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
  }
  const DOWN_AIM = {
    centreMm: { x: pose.x, y: pose.y },
    facing: facingVectorOf(pose.upx, pose.upy, pose.facing),
    stamp: drillStampOf(pose, false),
  }

  it('bites on a rim lip beside the body’s corner, just past its face, that the per-report rule does not see', () => {
    // 0.5 m down and 0.5 m across: past the face, outside the body's width, in the wall band.
    const lip = groundWith([[2, SURFACE_ROW - 2]])
    expect(drillContactOf(lip, DOWN_AIM)).toBe('none')
    expect(sweptDrillContactOf(lip, DOWN_AIM)).toBe('ahead')
  })

  it('never bites on a wall sample already down to its ramp', () => {
    const atRamp: DrillableGround = {
      densityAt: (sx, sy) => (sx === 2 && sy === SURFACE_ROW - 2 ? 25 : 0),
      materialAt: () => CELL_KIND.ground,
    }
    expect(sweptDrillContactOf(atRamp, DOWN_AIM)).toBe('none')
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
