import { describe, expect, it } from 'vitest'
import { vehicleOf } from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import {
  continueScriptedSession,
  createScriptedSession,
  dockInBay,
  GROUND,
  mineTile,
  type ScriptedSession,
} from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { placeHazardCommand } from './hazardDebugRules'
import { startToolActing } from './toolActing'

// A dive's hazard state (ticket 848): the hull its contacts took, a vent's shove and the tools
// acting all end at the dock, and every one of them, with the placed hazards, survives a snapshot.

const START = 100

function bittenSession(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
  mineTile(session, START + 1, GROUND)
  return session
}

describe('hazard dive', () => {
  it('drops the dive tally at the dock', () => {
    const session = bittenSession()
    expect(session.vehicle().hazardHullBp).toBe(50)
    dockInBay(session, START + 200, 'sell')
    expect(session.vehicle().hazardHullBp).toBeUndefined()
  })

  it('stops every acting tool at the dock, each stop logged', () => {
    const session = bittenSession()
    const acting = startToolActing(session.state(), 'p1', 'kit.plough')
    const docked = continueScriptedSession(acting.state)
    const events = dockInBay(docked, START + 200, 'sell')
    expect(events.filter(isToolActingEvent)).toMatchObject([
      { type: 'ToolActingChanged', toolId: 'kit.plough', on: false },
    ])
    expect(docked.vehicle().actingTools).toBeUndefined()
  })

  it('keeps the tally, the acting tools and the placed hazards through a snapshot', () => {
    const session = bittenSession()
    const state = startToolActing(session.state(), 'p1', 'kit.plough').state
    const restored = readSnapshot(takeSnapshot(state))
    expect(restored.problems).toEqual([])
    if (!('state' in restored)) return
    expect(stateDigest(restored.state)).toBe(stateDigest(state))
    expect(vehicleOf(restored.state, 'p1').actingTools).toEqual(['kit.plough'])
    expect(restored.state.placedHazards).toEqual({ [`${GROUND.tx},${GROUND.ty}`]: 'spinecrystal' })
  })

  it('refuses a snapshot whose acting tools are out of order', () => {
    const state = startToolActing(bittenSession().state(), 'p1', 'kit.plough').state
    const snapshot = takeSnapshot(state)
    snapshot.state.players.p1.vehicle.actingTools = ['kit.z', 'kit.a']
    expect(readSnapshot(snapshot).problems).toContain(
      'snapshot.state.players.p1.vehicle.actingTools must list tool ids in code-unit order, or be left out',
    )
  })
})

function isToolActingEvent(event: DomainEvent): boolean {
  return event.type === 'ToolActingChanged'
}
