import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { blockHardness } from '../economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { div, fromSafeInteger, mul, toFixedText } from '../money'
import { subStepsPerTile } from '../vehicle/drillRule'
import { FACING } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutFollowAt } from './cutFollowRead'
import { createScriptedSession, PARAMS, poseAbove } from './scriptedSession'

// The starting rigs' cut-follow speed per stored drill_power step (ticket 431, the Vertical
// Scaler's ratio question on #430): band-1 rock of planet 1 with the tip at step 0, so `eff` is 1
// and the drill law's speed is `D` cells/s. The table and its cause are in
// docs/economy/drill-ladder.md.
const STORED_STEPS = Array.from({ length: 31 }, (_, step) => step)
const STEPS_PER_MAJOR = 10
const BAND_1_ROCK = blockHardness(PARAMS.planetIndex, 1)
const COLUMN = 20
const REST = {
  x: COLUMN * 1000 + 500,
  y: (surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) + 1) * 1000 + 400,
}

function statsAtDrillStep(step: number) {
  return vehicleStatsAt({ ...startLevels(), drill_power: step })
}

/** The cut-follow's read in mm a tick, at a rig of `step` resting on the band-1 surface. */
function readStepMmAt(step: number): number {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: step },
  })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: REST.x, y: REST.y } })
  session.advanceTo(1)
  const drillingStep = { ...REST, facing: FACING.down, isLifting: false, isDrilling: true }
  const { cutSpeed } = cutFollowAt(session.state(), 'p1', drillingStep)
  // The read is whole mm a tick as m/s; rounding undoes the float of that conversion.
  return Math.round((cutSpeed * MM_PER_METRE) / TICKS_PER_SECOND)
}

/** The drill law's exact step in mm a tick, `1000 D eff / (60 H)`, to 6 places. */
function lawStepMmAt(step: number): number {
  const perSecond = div(statsAtDrillStep(step).drillPower, BAND_1_ROCK)
  const perTick = div(
    mul(perSecond, fromSafeInteger(MM_PER_METRE)),
    fromSafeInteger(TICKS_PER_SECOND),
  )
  return Number(toFixedText(perTick, 6))
}

/** The cell's sub-step drill time over one major's ten stored steps: the law's gain, unrounded. */
function majorGainOfSubSteps(fromStep: number): number {
  const subStepsAt = (step: number) =>
    subStepsPerTile(statsAtDrillStep(step), BAND_1_ROCK) as number
  return subStepsAt(fromStep) / subStepsAt(fromStep + STEPS_PER_MAJOR)
}

describe('starting rigs cut speed (ticket 431)', () => {
  it("keeps the drill law's 1.12 over every ten stored steps before the read rounds to mm", () => {
    for (const fromStep of STORED_STEPS.slice(0, -STEPS_PER_MAJOR)) {
      expect(majorGainOfSubSteps(fromStep)).toBeCloseTo(1.12, 3)
    }
  })

  it("reads the drill law's speed to within one mm a tick under it, never over it", () => {
    for (const step of STORED_STEPS) {
      const shortfall = lawStepMmAt(step) - readStepMmAt(step)
      expect(shortfall).toBeGreaterThanOrEqual(0)
      expect(shortfall).toBeLessThanOrEqual(1)
    }
  })
})
