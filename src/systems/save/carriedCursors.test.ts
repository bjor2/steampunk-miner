import { describe, expect, it } from 'vitest'
import { vehicleOf, withVehicle, type AuthorityState } from '../authority/authorityState'
import { createScriptedSession, PARAMS, poseAbove } from '../authority/scriptedSession'
import { takeSnapshot, type PortableState } from '../authority/sessionSnapshot'
import { NO_DRIVE } from '../vehicle/driveSigns'
import type { SweptCut } from '../vehicle/sweptCut'
import { FACING } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { withCarriedCursors } from './carriedCursors'
import { readMigratedSaveSlot } from './saveMigrations'
import { saveSlotOf } from './saveSlot'

/** A snapshot 20 state, as far as the reshape reads it: one player and the cursor it wrote. */
function snapshot20With(vehicle: Record<string, unknown>): PortableState {
  return { players: { p1: { vehicle } } } as unknown as PortableState
}

const OLD_CURSOR = {
  xMm: 20_500,
  yMm: 296_000,
  poseXMm: 20_500,
  poseYMm: 296_800,
  facing: 2,
  tick: 40,
  cutGate: 1,
  cutGateLowTicks: 0,
  cutSharePassed: 20,
  digSubSteps: 480,
}

describe('save migration: snapshot 20 -> 21 carried cursors (ticket 399)', () => {
  it('gives a saved cursor no carried work, as a fresh step starts', () => {
    const reshaped = withCarriedCursors(snapshot20With({ sweptCut: OLD_CURSOR }))
    expect(reshaped.players.p1.vehicle.sweptCut).toEqual({ ...OLD_CURSOR, carrySubSteps: 0 })
  })

  it('leaves a vehicle that never sent a drill step without a cursor', () => {
    const reshaped = withCarriedCursors(snapshot20With({ energy: 7 }))
    expect(reshaped.players.p1.vehicle).toEqual({ energy: 7 })
  })
})

/** A rig resting on band-1 ground with a cursor, as snapshot 20 kept it: no carried work. */
function snapshot20State(): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const at = { x: 20_500, y: (surfaceRowOfColumn(20, PARAMS.radiusTiles) + 1) * 1000 + 400 }
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...at } })
  for (let tick = 1; tick <= 3; tick++) {
    session.submit(tick, { type: 'drillStep', payload: { ...at, drive: NO_DRIVE } })
  }
  const state = session.state()
  const vehicle = vehicleOf(state, 'p1')
  const { carrySubSteps: _carried, ...cursor } = vehicle.sweptCut as SweptCut
  return withVehicle(state, 'p1', { ...vehicle, sweptCut: cursor as SweptCut })
}

describe('save migration chain: snapshot 20 -> 21 (ticket 399)', () => {
  it('loads a snapshot 20 save with a cursor at no carried work, its digest checked', () => {
    const old = snapshot20State()
    const file = saveSlotOf({ ...takeSnapshot(old), snapshotVersion: 20 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([{ version: 'snapshotVersion', from: 20, to: 21 }])
    expect(vehicleOf(reading.state, 'p1').sweptCut).toEqual({
      ...vehicleOf(old, 'p1').sweptCut,
      carrySubSteps: 0,
    })
  })
})
