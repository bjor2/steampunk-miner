import { describe, expect, it } from 'vitest'
import { FACING, bayPoseAt, dockedPoseAt } from '../vehicle/vehiclePose'
import { createScriptedSession, GROUND, poseAbove, SITE, typesOf } from './scriptedSession'

const teleportToDock = { type: 'debug.teleportToDock', payload: { bay: 'sell' } } as const

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

  it('docks in the Upgrade bay when asked, saying so in dock_entered (#37)', () => {
    const session = createScriptedSession()
    const events = session.submit(20, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
    expect(events[1]).toMatchObject({ type: 'DockEntered', bay: 'upgrade' })
    expect(session.vehicle().pose).toEqual(bayPoseAt(SITE, 'upgrade'))
  })

  it('refuses a bay that is not one, naming it', () => {
    const session = createScriptedSession()
    const intent = { type: 'debug.teleportToDock', payload: { bay: 'workshop' } }
    const [refused] = session.submit(2, intent as unknown as typeof teleportToDock)
    expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'invalid_payload' })
  })

  it('refuses a vehicle that is already docked, with a listed problem', () => {
    const session = createScriptedSession()
    session.submit(1, { type: 'dock', payload: { bay: 'sell' } })
    const [refused] = session.submit(2, teleportToDock)
    expect(refused).toMatchObject({
      type: 'CommandRejected',
      reason: 'vehicle_not_active',
      problems: ['the vehicle is already docked'],
    })
  })
})
