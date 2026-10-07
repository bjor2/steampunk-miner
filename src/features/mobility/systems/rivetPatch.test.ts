import { describe, expect, it } from 'vitest'
import { GROUND, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { add, div, fromSafeInteger, toCanonical } from '../../../systems/money'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { chargesLeftOf } from '../../power-up-core'
import { MM, ofType, poseAt, press, sessionWith } from '../mobilityTestSession'
import { MOBILITY_ITEM } from './itemIds'
import { mobilityOf } from './mobilitySection'

// The rivet patch kit (#162 4.3, GD lock on #204 Q6, G&V on #204): a 6-tick wind-up, then a
// 90-tick hold that plates +25% of hullMax on. Moving is any movement or drill input, or a speed
// above 0.5 cells/s: idling on a 5° slope finishes the patch, a single thrust tap at tick 45
// cancels it and refunds one unit.

const PATCH = { 'powerup.1': MOBILITY_ITEM.rivetPatch }
const STAND = { x: GROUND.tx * MM + MM / 2, y: (GROUND.ty + 1) * MM + MM / 2 }
/** The wind-up ends on tick 16 and the hold on tick 106. */
const PRESS_TICK = 10
const FINISH_TICK = 106
/** A 5° slope settling: a creep well under 0.5 cells/s, with no input. */
const SLOPE_CREEP = { vx: 87, vy: -8 }

function damagedPatchSession(): ScriptedSession {
  const session = sessionWith(PATCH)
  session.submit(2, { type: 'debug.setHull', payload: { hull: '10' } })
  session.submit(PRESS_TICK, press())
  return session
}

/** Reports the creep every 12 ticks (5 Hz) up to `lastTick`, stepping the clock one tick at a time or in jumps. */
function idleOnSlope(session: ScriptedSession, lastTick: number, isStepping: boolean): void {
  for (let tick = PRESS_TICK + 1; tick <= lastTick; tick += 1) {
    if (isStepping) session.advanceTo(tick)
    if ((tick - PRESS_TICK) % 12 === 0) {
      session.submit(tick, poseAt(STAND.x, STAND.y, FACING.right, SLOPE_CREEP))
    }
  }
  session.advanceTo(lastTick)
}

const hullOf = (session: ScriptedSession) => toCanonical(session.vehicle().hull)
const unitsLeft = (session: ScriptedSession) =>
  chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.rivetPatch)

describe('rivet patch kit', () => {
  it('plates a quarter of hullMax on after holding still on a 5° slope for the whole hold', () => {
    const session = damagedPatchSession()
    idleOnSlope(session, FINISH_TICK + 2, false)
    const plate = div(statsOfVehicle(session.vehicle()).hullMax, fromSafeInteger(4))
    const hullAfter = toCanonical(add(fromSafeInteger(10), plate))
    expect(ofType(session.events(), 'mobility.HullPatched')).toEqual([
      {
        tick: FINISH_TICK,
        type: 'mobility.HullPatched',
        playerId: 'p1',
        amount: toCanonical(plate),
        hullAfter,
      },
    ])
    expect(hullOf(session)).toBe(hullAfter)
    expect(unitsLeft(session)).toBe(1)
    expect(mobilityOf(session.state(), 'p1').patch).toBeNull()
  })

  it('finishes on the same tick stepping the clock one tick at a time or jumping it', () => {
    const stepped = damagedPatchSession()
    idleOnSlope(stepped, FINISH_TICK + 2, true)
    const jumped = damagedPatchSession()
    idleOnSlope(jumped, FINISH_TICK + 2, false)
    expect(ofType(stepped.events(), 'mobility.HullPatched')).toEqual(
      ofType(jumped.events(), 'mobility.HullPatched'),
    )
    expect(hullOf(stepped)).toBe(hullOf(jumped))
  })

  it('is cancelled by a single thrust tap at tick 45, refunding one unit and plating nothing', () => {
    const session = damagedPatchSession()
    session.advanceTo(44)
    session.submit(45, poseAt(STAND.x, STAND.y, FACING.right, { thrustTicks: 1 }))
    session.advanceTo(FINISH_TICK + 10)
    expect(ofType(session.events(), 'mobility.PatchCancelled')).toMatchObject([
      { tick: 46, playerId: 'p1', chargesLeft: 2 },
    ])
    expect(ofType(session.events(), 'mobility.HullPatched')).toEqual([])
    expect(hullOf(session)).toBe('1e+1')
    expect(unitsLeft(session)).toBe(2)
  })

  it('is cancelled by a speed above half a cell a second, though no input was billed', () => {
    const session = damagedPatchSession()
    session.advanceTo(30)
    session.submit(30, poseAt(STAND.x, STAND.y, FACING.right, { vx: 600 }))
    session.advanceTo(FINISH_TICK)
    expect(ofType(session.events(), 'mobility.PatchCancelled')).toHaveLength(1)
    expect(unitsLeft(session)).toBe(2)
  })

  it('refuses a second patch while one holds, at no cost', () => {
    const session = damagedPatchSession()
    session.advanceTo(20)
    session.submit(20, press())
    const events = session.advanceTo(30)
    expect(ofType(events, 'power-up-core.PowerUpRefused')).toMatchObject([
      { reason: 'mobility.patch_holding', chargesLeft: 1 },
    ])
  })
})
