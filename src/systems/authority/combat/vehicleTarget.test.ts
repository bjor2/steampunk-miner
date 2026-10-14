import { describe, expect, it } from 'vitest'
import { NO_DRIVE } from '../../vehicle/driveSigns'
import { FACING } from '../../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../../world/tileGrid'
import { createScriptedSession, PARAMS, poseAbove } from '../scriptedSession'
import { vehicleTargetOf } from './vehicleTarget'

// Where an enemy sees the rig (#9): the last report carried on by its velocity, or, with the
// swept cut, the last drill step after it (ticket 334, TD scope a on #316).

const COLUMN = 20
const START = {
  x: COLUMN * 1000 + 500,
  y: (surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) + 6) * 1000 + 500,
}
/** Falling at 6 m/s when it reported, 100 mm a tick. */
const FALLING_MM_PER_SECOND = -6000

function sessionReportedFalling() {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, {
    type: 'reportPose',
    payload: { ...payload, x: START.x, y: START.y, vy: FALLING_MM_PER_SECOND },
  })
  return session
}

describe('vehicle target (ticket 334)', () => {
  it('carries the last report on by its velocity while no drill step came after it', () => {
    const target = vehicleTargetOf(sessionReportedFalling().state(), 'p1', 6)
    expect(target?.position).toEqual({ x: START.x, y: START.y - 600 })
  })

  it('places the rig at a later drill step, carried on from the step’s tick', () => {
    const session = sessionReportedFalling()
    const stoppedAt = { x: START.x, y: START.y - 150 }
    session.submit(4, { type: 'drillStep', payload: { ...stoppedAt, drive: NO_DRIVE } })
    const target = vehicleTargetOf(session.state(), 'p1', 6)
    expect(target?.position).toEqual({ x: stoppedAt.x, y: stoppedAt.y - 200 })
  })
})
