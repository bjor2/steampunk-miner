import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { createScriptedSession, GROUND, poseAbove } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { AIM, aimOfFacing, aimOfPose } from '../vehicle/aim'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import { readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot, saveSlotOf } from './saveSlot'

// Ticket 791: the drill aims between the four facings. A save or a log from before it holds
// facings only, and each one reads as its cardinal aim: left a half turn, right none, down three
// quarters, up a quarter.

const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const FACINGS: readonly Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]

function restoredState(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** A session whose one vehicle last reported `facing`, with no aim, as a log before protocol 107. */
function reportedFacing(facing: Facing): AuthorityState {
  const session = createScriptedSession()
  session.submit(1, poseAbove(GROUND, facing))
  return session.state()
}

describe('save migration: snapshot 25 -> 26, the drill aim (ticket 791)', () => {
  it('maps an old report facing 0 to 3 to the four cardinal aims', () => {
    const aims = FACINGS.map((facing) => aimOfPose(reportedFacing(facing).players.p1.vehicle.pose!))
    expect(aims).toEqual([AIM.left, AIM.right, AIM.down, AIM.up])
    expect(FACINGS.map(aimOfFacing)).toEqual([32, 0, 48, 16])
  })

  it('reads an old save pose at its facing, with no aim key', () => {
    const state = restoredState(PLANET_1_SAVE)
    for (const { vehicle } of Object.values(state.players)) {
      if (vehicle.pose === null) continue
      expect('aim' in vehicle.pose).toBe(false)
      expect(aimOfPose(vehicle.pose)).toBe(aimOfFacing(vehicle.pose.facing))
    }
  })

  it('loads a snapshot 25 save through its step and the premium ledger step, state and digest as saved', () => {
    const state = reportedFacing(FACING.down)
    const file = saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 25 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([
      { version: 'snapshotVersion', from: 25, to: 26 },
      { version: 'snapshotVersion', from: 26, to: 27 },
    ])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('keeps an aim off the four facings through save and load', () => {
    const session = createScriptedSession()
    const { payload } = poseAbove(GROUND, FACING.right)
    session.submit(1, { type: 'reportPose', payload: { ...payload, aim: 60 } })
    const reading = readSaveSlot(throughJson(saveSlotOf(takeSnapshot(session.state()), 1)))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.state.players.p1.vehicle.pose).toMatchObject({ facing: FACING.right, aim: 60 })
    expect(reading.state).toEqual(session.state())
  })
})
