import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import {
  createScriptedSession,
  poseInBay,
  type ScriptedSession,
} from '../../../../systems/authority/scriptedSession'
import {
  workshopStagingOf,
  worksOriginOf,
  ROLL_TICKS,
  SHOWCASE_CAMERA_TICKS,
} from './workshopStaging'
import { dockSiteOfPlanet } from '../../../../systems/authority/planetOfState'
import { stateDigest } from '../../../../systems/authority/stateDigest'

/** The shipped Works: the turntable at the origin, the showcase camera 1.8 m above it (#174). */
const POINTS = { platformAtM: [0, 0], showcaseCamAtM: [0, 1.8] } as const
const DOCK_TICK = 10
/** Stopped near the Works zone's west edge (columns 5 to 8), 1.8 m short of the turntable. */
const STOP_X_MM = 5200

function stoppedAtTheWorks(): ScriptedSession {
  const session = createScriptedSession()
  const { payload } = poseInBay('upgrade')
  session.submit(DOCK_TICK, { type: 'reportPose', payload: { ...payload, x: STOP_X_MM } })
  return session
}

function dockedAtTheWorks(): ScriptedSession {
  const session = stoppedAtTheWorks()
  session.submit(DOCK_TICK, { type: 'dock', payload: { bay: 'upgrade' } })
  return session
}

const at = (state: AuthorityState, tick: number): AuthorityState => ({ ...state, tick })

function drawnXAt(state: AuthorityState, tick: number): number {
  const staging = workshopStagingOf(at(state, tick), 'p1', POINTS)
  return STOP_X_MM / 1000 + (staging?.drawOffsetX ?? 0)
}

function platformX(state: AuthorityState): number {
  return worksOriginOf(dockSiteOfPlanet(state.planet)!).x + POINTS.platformAtM[0]
}

describe('workshop auto-roll', () => {
  it('draws the car onto the turntable centre within 30 ticks of docking, from where it stopped', () => {
    const state = dockedAtTheWorks().state()
    expect(drawnXAt(state, DOCK_TICK)).toBeCloseTo(STOP_X_MM / 1000, 9)
    expect(drawnXAt(state, DOCK_TICK + ROLL_TICKS / 2)).toBeGreaterThan(STOP_X_MM / 1000)
    expect(drawnXAt(state, DOCK_TICK + ROLL_TICKS)).toBe(platformX(state))
    expect(drawnXAt(state, DOCK_TICK + 600)).toBe(platformX(state))
  })

  it('leaves the authority pose where the vehicle stopped: the roll is drawn only', () => {
    const before = stoppedAtTheWorks().state().players.p1.vehicle.pose
    const state = dockedAtTheWorks().state()
    expect(state.players.p1.vehicle.pose).toEqual(before)
    const digest = stateDigest(state)
    workshopStagingOf(at(state, DOCK_TICK + 5), 'p1', POINTS)
    expect(stateDigest(state)).toBe(digest)
  })

  it('moves the camera to the showcase framing over 24 ticks', () => {
    const state = dockedAtTheWorks().state()
    const weightAt = (tick: number) =>
      workshopStagingOf(at(state, tick), 'p1', POINTS)?.cameraWeight
    expect(weightAt(DOCK_TICK)).toBe(0)
    expect(weightAt(DOCK_TICK + SHOWCASE_CAMERA_TICKS - 1)).toBeLessThan(1)
    expect(weightAt(DOCK_TICK + SHOWCASE_CAMERA_TICKS)).toBe(1)
    const staging = workshopStagingOf(at(state, DOCK_TICK), 'p1', POINTS)!
    expect(staging.cameraX).toBe(platformX(state))
    expect(staging.cameraY).toBeCloseTo(dockSiteOfPlanet(state.planet)!.padRow + 1 + 1.8, 9)
  })

  it('lets a held drive key leave only while docked at the Works', () => {
    const state = dockedAtTheWorks().state()
    expect(workshopStagingOf(at(state, DOCK_TICK + 40), 'p1', POINTS)?.canLeaveByDriveHold).toBe(
      true,
    )
  })

  it('rolls the car back off on leaving and hands control back within 30 ticks', () => {
    const session = dockedAtTheWorks()
    const leaveTick = DOCK_TICK + 100
    session.submit(leaveTick, { type: 'undock', payload: {} })
    const state = session.state()
    const stagingAt = (tick: number) => workshopStagingOf(at(state, tick), 'p1', POINTS)
    expect(drawnXAt(state, leaveTick)).toBe(platformX(state))
    expect(stagingAt(leaveTick + ROLL_TICKS - 1)?.isHoldingInput).toBe(true)
    expect(stagingAt(leaveTick + ROLL_TICKS - 1)?.canLeaveByDriveHold).toBe(false)
    expect(stagingAt(leaveTick + ROLL_TICKS)).toBeNull()
  })

  it('stages nothing at the Sell bay, on the way past the Works or before docking', () => {
    const atSell = createScriptedSession()
    atSell.submit(5, { type: 'dock', payload: { bay: 'sell' } })
    expect(workshopStagingOf(at(atSell.state(), 20), 'p1', POINTS)).toBeNull()
    expect(workshopStagingOf(at(stoppedAtTheWorks().state(), 400), 'p1', POINTS)).toBeNull()
  })
})
