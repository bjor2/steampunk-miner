import { describe, expect, it } from 'vitest'
import { BASE_GRAVITY } from '../../constants/physics'
import { rampAllowedStepMmOf, rampedFrontStepMmOf } from './downCutRamp'
import { FACING } from './vehiclePose'

// Bjor's ruling on #724 on the swept cut's front: a cut down's front steps no further than the
// body can move, the last report's speed plus a dt for each tick since, a tick's worth rounded up.

const fromRest = (ticksSinceReport: number) => ({
  reportedMmPerSecond: 0,
  ticksSinceReport,
  acceleration: BASE_GRAVITY,
})

describe('gravity ramp on the front of a cut down (#724)', () => {
  it('lets a body at rest move one tick of the ramp, a dt² rounded up', () => {
    expect(rampAllowedStepMmOf(fromRest(0))).toBe(4)
    expect(rampAllowedStepMmOf({ ...fromRest(0), acceleration: BASE_GRAVITY * 0.1 })).toBe(1)
  })

  it('grows by a dt each tick since the report', () => {
    expect(rampAllowedStepMmOf(fromRest(59))).toBe(200)
    expect(rampAllowedStepMmOf({ ...fromRest(11), acceleration: BASE_GRAVITY * 1.25 })).toBe(50)
  })

  it('starts from the speed the report gave', () => {
    const moving = { reportedMmPerSecond: 30_000, ticksSinceReport: 0, acceleration: BASE_GRAVITY }
    expect(rampAllowedStepMmOf(moving)).toBe(504)
  })

  it("holds a cut down's front to the ramp, never past the drill's step", () => {
    expect(rampedFrontStepMmOf(FACING.down, 1400, fromRest(0))).toBe(4)
    expect(rampedFrontStepMmOf(FACING.down, 100, fromRest(59))).toBe(100)
  })

  it('leaves a sideways or upward front to the drill and the drive', () => {
    for (const facing of [FACING.left, FACING.right, FACING.up]) {
      expect(rampedFrontStepMmOf(facing, 1400, fromRest(0))).toBe(1400)
    }
  })
})
