import { describe, expect, it } from 'vitest'
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { poseRidingFront, type Point } from '../authority/faceHoldFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { readSaveSlot, saveSlotOf } from './saveSlot'

// The swept cut's front (ticket 570) is the one field the cursor gained: where the tick's cut
// stopped inside a cell its work had not finished paying. A save in the middle of such a cell
// restores it, so the cut goes on from the same face and charges nothing twice; the play after a
// load matches the play that never saved, event for event.

/** A band-1 surface column east of the dock; the body starts on its surface. */
const COLUMN = 20
const START: Point = {
  x: COLUMN * 1000 + 500,
  y: (surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) + 1) * 1000 + 450,
}
/** The level-0 drill pays a band-1 cell over 40 ticks, so a tick's cut stops inside one. */
const SAVE_TICK = 30
const PLAY_ON_TICKS = 30

const stepTo = ({ x, y }: Point) =>
  ({ type: 'drillStep', payload: { x, y, facing: FACING.down, drive: NO_DRIVE } }) as const

function sessionOnSurface(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
  return session
}

/** A body riding its cut's front down from `body`, one step a tick over `ticks`. */
function rideDown(session: ScriptedSession, body: Point, ticks: { from: number; to: number }) {
  let at = body
  for (let tick = ticks.from; tick < ticks.to; tick++) {
    session.submit(tick, stepTo(at))
    const pose = { ...(session.vehicle().pose as VehiclePose), ...at, facing: FACING.down }
    at = poseRidingFront(pose, session.vehicle().sweptCut)
  }
  return at
}

function roundTripped(state: AuthorityState): AuthorityState {
  const reading = readSaveSlot(JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(state), 1))))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

function playedOn(start: AuthorityState, body: Point) {
  const session = continueScriptedSession(start)
  rideDown(session, body, { from: SAVE_TICK, to: SAVE_TICK + PLAY_ON_TICKS })
  return { events: session.events(), digest: stateDigest(session.state()) }
}

describe('save slot: the swept cut front (ticket 570)', () => {
  const session = sessionOnSurface()
  const body = rideDown(session, START, { from: 1, to: SAVE_TICK })
  const saved = session.state()

  it('saves a cut stopped inside a cell with its front, and restores it', () => {
    const cursor = vehicleOf(saved, 'p1').sweptCut
    expect(cursor?.front).toBeDefined()
    const loaded = roundTripped(saved)
    expect(vehicleOf(loaded, 'p1').sweptCut).toEqual(cursor)
    expect(stateDigest(loaded)).toBe(stateDigest(saved))
  })

  it('plays the cut on from a load as from the state that never saved', () => {
    const unsaved = playedOn(saved, body)
    const loaded = playedOn(roundTripped(saved), body)
    expect(loaded.events).toEqual(unsaved.events)
    expect(loaded.digest).toBe(unsaved.digest)
  })
})
