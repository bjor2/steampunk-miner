import { describe, expect, it } from 'vitest'
import { NO_DRIVE } from '../../vehicle/driveSigns'
import { FACING } from '../../vehicle/vehiclePose'
import { createScriptedSession, poseAbove } from '../scriptedSession'
import { vehicleBodiesOf } from './collapseWatch'

// Where a collapse looks for the vehicle (#43 Vehicle safety, ticket 662): the refill keeps clear
// round a body's centre, which is where it last stood. A pose report lags a moving body by up to
// twelve ticks, 1.2 m at a 6 m/s level cut, past the clearance round it; the drill steps it sends
// every tick in between carry its position.

const COLUMN = { tx: 20, ty: 280 }

function reportedThenStepped(stepYs: readonly number[]) {
  const session = createScriptedSession()
  const report = poseAbove(COLUMN, FACING.down)
  session.submit(1, report)
  stepYs.forEach((y, at) =>
    session.submit(2 + at, {
      type: 'drillStep',
      payload: { x: report.payload.x, y, facing: FACING.down, drive: NO_DRIVE },
    }),
  )
  return { session, report }
}

describe('collapse: the vehicle’s body (ticket 662)', () => {
  it('stands at the report while no drill step came after it', () => {
    const { session, report } = reportedThenStepped([])
    expect(vehicleBodiesOf(session.state())).toEqual([
      { playerId: 'p1', centre: { xMm: report.payload.x, yMm: report.payload.y } },
    ])
  })

  it('stands at its last drill step once the steps run ahead of the report', () => {
    const { session, report } = reportedThenStepped([281_400, 281_300, 281_200])
    expect(vehicleBodiesOf(session.state())).toEqual([
      { playerId: 'p1', centre: { xMm: report.payload.x, yMm: 281_200 } },
    ])
  })
})
