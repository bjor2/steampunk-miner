import { describe, expect, it } from 'vitest'
import { discSamplesOf } from '../world/stampShape'
import { CLOSED_CUT_GATE } from './cutGate'
import { sweptDrillStampOf } from './drillStamp'
import {
  lastClearStep,
  pointAtStep,
  sweepPathOf,
  sweptStampOf,
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
    const stamp = sweptStampOf(
      path,
      STAMP,
      lastClearStep(path, () => false),
    )
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

  it('stops at the last sub-step before the centre enters a stopping cell', () => {
    const path = sweepPathOf(CURSOR, POSE, STEP_STAMP, 10)
    const stopRow = Math.floor(STAMP.yMm / 1000)
    const clear = lastClearStep(path, (tile) => tile.ty === stopRow)
    expect(clear).toBeLessThan(path.steps)
    expect(Math.floor(pointAtStep(path, clear).yMm / 1000)).toBeGreaterThan(stopRow)
    expect(Math.floor(pointAtStep(path, clear + 1).yMm / 1000)).toBe(stopRow)
  })

  it('cuts nothing on a fresh path whose body point stands in a stopping cell', () => {
    const path = sweepPathOf(undefined, POSE, STEP_STAMP, 10)
    expect(lastClearStep(path, () => true)).toBe(-1)
  })
})
