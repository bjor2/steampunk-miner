import { describe, expect, it } from 'vitest'
import { FACING, dockedPoseAt } from '../vehicle/vehiclePose'
import { createScriptedSession, GROUND, poseAbove, SITE, typesOf } from './scriptedSession'

const teleportToDock = { type: 'debug.teleportToDock', payload: {} } as const

describe('debug.teleportToDock', () => {
  it('docks an active vehicle on the dock point, as a dock would, wherever it was', () => {
    const session = createScriptedSession()
    session.submit(10, poseAbove(GROUND, FACING.down))
    const events = session.submit(20, teleportToDock)
    expect(typesOf(events)).toEqual([
      'VehicleModeChanged',
      'DockEntered',
      'StateDigested',
      'DebugCommandApplied',
    ])
    expect(session.vehicle()).toMatchObject({ mode: 'docked', pose: dockedPoseAt(SITE) })
    expect(session.state().debugApplied).toBe(true)
  })

  it('brings a stranded vehicle home without a tow fee', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '0.05' } })
    session.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    expect(session.vehicle().mode).toBe('stranded')
    const events = session.submit(20, teleportToDock)
    expect(typesOf(events)).not.toContain('RescueTriggered')
    expect(session.vehicle().mode).toBe('docked')
  })

  it('refuses a vehicle that is already docked, with a listed problem', () => {
    const session = createScriptedSession()
    session.submit(1, { type: 'dock', payload: {} })
    const [refused] = session.submit(2, teleportToDock)
    expect(refused).toMatchObject({
      type: 'CommandRejected',
      reason: 'vehicle_not_active',
      problems: ['the vehicle is already docked'],
    })
  })
})
