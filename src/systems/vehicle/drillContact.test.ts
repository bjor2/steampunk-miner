import { describe, expect, it } from 'vitest'
import { SOLID_DENSITY } from '../world/sampleGrid'
import { CELL_KIND } from '../world/worldCell'
import { drillContactOf, sweptDrillContactOf, type DrillableGround } from './drillContact'
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
