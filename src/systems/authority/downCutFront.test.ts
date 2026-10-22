import { describe, expect, it } from 'vitest'
import { BASE_GRAVITY } from '../../constants/physics'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { rampAllowedStepMmOf } from '../vehicle/downCutRamp'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { frontStepMmAt, type CutFollowStep } from './cutFollowRead'
import { createScriptedSession, PARAMS, poseAbove, type ScriptedSession } from './scriptedSession'
import { movingDownAtCutSpeed } from './sweptRigFixtures'

// Bjor's ruling on #724 in the authority: a cut down's front steps no further in a tick than the
// body can move, the speed its last report gave plus a dt for each tick since, so the rig never
// drills a hole ahead of a body still gaining speed; a body reported at the drill's speed is cut
// for at the drill's step at once.

const COLUMN = 20
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
const REST = { x: COLUMN * 1000 + 500, y: (SURFACE_TY + 1) * 1000 + 400 }
/** Planet 1's surface gravity, the planet the scripted session plays. */
const SURFACE_G = BASE_GRAVITY * PARAMS.gravityMultiplier

/** A fast drill reported at `REST` facing `facing` on tick 0, at rest or at its cut speed down. */
function fastDrillReported(facing: Facing, isMovingAtCutSpeed = false): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 20 } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, facing)
  const moving = isMovingAtCutSpeed ? movingDownAtCutSpeed(session.state(), payload) : {}
  session.submit(0, {
    type: 'reportPose',
    payload: { ...payload, x: REST.x, y: REST.y, ...moving },
  })
  return session
}

const stepAt = (y: number, facing: Facing): CutFollowStep => ({
  x: REST.x,
  y,
  facing,
  isLifting: false,
  isDrilling: true,
})

/** The front's step a cut down may take on `tick`, the body at rest at `REST` since tick 0. */
function frontStepOnTick(session: ScriptedSession, tick: number, facing: Facing = FACING.down) {
  session.advanceTo(tick)
  return frontStepMmAt(session.state(), 'p1', stepAt(REST.y, facing))
}

const fromRest = (ticksSinceReport: number) => ({
  reportedMmPerSecond: 0,
  ticksSinceReport,
  acceleration: SURFACE_G,
})

describe("a cut down's front under the gravity ramp (#724)", () => {
  it('starts a cut down from rest at the ramp, growing with the ticks since the report', () => {
    expect(frontStepOnTick(fastDrillReported(FACING.down), 1)).toBe(
      rampAllowedStepMmOf(fromRest(1)),
    )
    expect(frontStepOnTick(fastDrillReported(FACING.down), 30)).toBe(
      rampAllowedStepMmOf(fromRest(30)),
    )
  })

  it("cuts for a body reported at the drill's speed at the drill's step", () => {
    const session = fastDrillReported(FACING.down, true)
    const reachedAtOnce = frontStepOnTick(session, 1)
    expect(reachedAtOnce).toBeGreaterThan(rampAllowedStepMmOf(fromRest(1)))
    session.submit(1, {
      type: 'drillStep',
      payload: { x: REST.x, y: REST.y, facing: FACING.down, drive: NO_DRIVE },
    })
    expect(frontStepOnTick(session, 2)).toBeGreaterThanOrEqual(reachedAtOnce)
  })

  it("never ramps a cut up: its front steps the drill's from rest", () => {
    expect(frontStepOnTick(fastDrillReported(FACING.up), 1, FACING.up)).toBeGreaterThan(
      rampAllowedStepMmOf(fromRest(1)),
    )
  })
})
