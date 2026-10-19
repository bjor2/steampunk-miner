import { describe, expect, it } from 'vitest'
import { discSamplesOf } from '../world/stampShape'
import { CLOSED_CUT_GATE } from './cutGate'
import { sweptDrillStampOf } from './drillStamp'
import {
  carrySubStepsIn,
  digSubStepsAfter,
  pointAtStep,
  sweepPathOf,
  sweptStampOf,
  stepDigTicksOf,
  SWEEP_STEP_MM,
  type SweptCut,
} from './sweptCut'
import { FACING, type VehiclePose } from './vehiclePose'

const POSE: VehiclePose = {
  x: 20_500,
  y: 296_700,
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  facing: FACING.down,
}
/** The stamp 800 mm ahead of the pose: a report's 500 plus a 300 mm cutting step. */
const AHEAD_MM = 800
const STAMP = sweptDrillStampOf(POSE, false, AHEAD_MM)
const STEP_STAMP = { stamp: STAMP, aheadMm: AHEAD_MM }

/** The cursor a step at tick 9 left 300 mm above this stamp. */
const CURSOR: SweptCut = {
  xMm: STAMP.xMm,
  yMm: STAMP.yMm + 300,
  poseXMm: POSE.x,
  poseYMm: POSE.y + 300,
  facing: FACING.down,
  tick: 9,
  ...CLOSED_CUT_GATE,
  cutSharePassed: 0,
  digSubSteps: 0,
  carrySubSteps: 0,
}

describe('swept cut path (ticket 330)', () => {
  it('continues from the cursor cut on the tick before with the same facing', () => {
    const path = sweepPathOf(CURSOR, POSE, STEP_STAMP, 10)
    expect(path.isFresh).toBe(false)
    expect(path.from).toEqual({ xMm: CURSOR.xMm, yMm: CURSOR.yMm })
    expect(path.to).toEqual({ xMm: STAMP.xMm, yMm: STAMP.yMm })
  })

  it('starts fresh from the body after a tick with no step, or a turn', () => {
    const late = sweepPathOf(CURSOR, POSE, STEP_STAMP, 11)
    const turned = sweepPathOf({ ...CURSOR, facing: FACING.right }, POSE, STEP_STAMP, 10)
    for (const path of [late, turned, sweepPathOf(undefined, POSE, STEP_STAMP, 10)]) {
      expect(path.isFresh).toBe(true)
      expect(path.from).toEqual({ xMm: STAMP.xMm, yMm: STAMP.yMm + AHEAD_MM })
    }
  })

  it('cuts the bare stamp a report cuts when a fresh path is clear', () => {
    const path = sweepPathOf(undefined, POSE, STEP_STAMP, 10)
    const stamp = sweptStampOf(path, STAMP, path.steps)
    expect(discSamplesOf(stamp)).toEqual(discSamplesOf(STAMP))
  })

  it('walks the centre at most 125 mm a sub-step', () => {
    const path = sweepPathOf(CURSOR, POSE, STEP_STAMP, 10)
    for (let step = 1; step <= path.steps; step++) {
      const from = pointAtStep(path, step - 1)
      const to = pointAtStep(path, step)
      expect(Math.hypot(to.xMm - from.xMm, to.yMm - from.yMm)).toBeLessThanOrEqual(SWEEP_STEP_MM)
    }
  })
})

describe('swept cut dig time for heat (ticket 335)', () => {
  const at = (tick: number, digSubSteps: number): SweptCut => ({ ...CURSOR, tick, digSubSteps })

  it('adds a step dig time to the steps since the last charged report', () => {
    expect(digSubStepsAfter(undefined, 0, 90)).toBe(90)
    expect(digSubStepsAfter(at(9, 150), 6, 90)).toBe(240)
  })

  it('keeps only what the report left of a whole tick once it has charged the steps', () => {
    expect(digSubStepsAfter(at(9, 150), 9, 90)).toBe(30 + 90)
    expect(digSubStepsAfter(at(9, 150), 12, 0)).toBe(30)
  })

  it('heats for the whole ticks of the summed dig time', () => {
    expect(stepDigTicksOf(at(9, 59))).toBe(0)
    expect(stepDigTicksOf(at(9, 150))).toBe(2)
  })
})

describe('swept cut dig time and carry in a lifted drill quantum (ticket 558)', () => {
  const lifted = (digSubSteps: number, carrySubSteps: number): SweptCut => ({
    ...CURSOR,
    tick: 9,
    digSubSteps,
    carrySubSteps,
    quantum: 240,
  })

  it("heats for whole ticks of the cursor's own quantum", () => {
    expect(stepDigTicksOf(lifted(239, 0))).toBe(0)
    expect(stepDigTicksOf(lifted(600, 0))).toBe(2)
  })

  it('counts a base cursor exactly in a lifted quantum, and a lifted one down in whole sub-steps', () => {
    expect(digSubStepsAfter({ ...CURSOR, tick: 9, digSubSteps: 150 }, 6, 10, 240)).toBe(610)
    expect(digSubStepsAfter(lifted(601, 0), 6, 1, 60)).toBe(151)
    expect(digSubStepsAfter(lifted(601, 0), 9, 0, 240)).toBe(121)
  })

  it('carries its work into the quantum the next tick counts in', () => {
    expect(carrySubStepsIn(lifted(0, 37), 240)).toBe(37)
    expect(carrySubStepsIn(lifted(0, 37), 480)).toBe(74)
    expect(carrySubStepsIn({ ...CURSOR, carrySubSteps: 5 }, 240)).toBe(20)
    expect(carrySubStepsIn(undefined, 240)).toBe(0)
  })
})
