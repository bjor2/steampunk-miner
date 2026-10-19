import { describe, expect, it } from 'vitest'
import { stateDigest } from '../../systems/authority/stateDigest'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { vehicleLookSources } from '../../systems/registries/vehicleLooks'
import { DRILL_LOOK_SOURCE_ID, drillLookStageOfPlayer } from './systems/drillLookSource'

const setDrillPower = (level: number) => ({
  type: 'debug.setUpgrade' as const,
  payload: { upgradeId: 'drill_power', level },
})

const drillLookSource = () => vehicleLookSources().find((s) => s.id === DRILL_LOOK_SOURCE_ID)!

describe('drill look on the vehicle', () => {
  it('wears no look on a new vehicle', () => {
    const session = createScriptedSession()
    expect(drillLookSource().lookOf(session.state(), 'p1', 0)).toBeNull()
  })

  it('steps up when the drill_power purchases reach a threshold', () => {
    const session = createScriptedSession()
    session.submit(1, setDrillPower(4))
    const before = drillLookSource().lookOf(session.state(), 'p1', 1)
    session.submit(2, setDrillPower(5))
    const after = drillLookSource().lookOf(session.state(), 'p1', 2)
    expect(before).toBeNull()
    expect(after?.glows.map((glow) => glow.slots[0])).toEqual(['drill-bit', 'drill-head'])
    expect(drillLookStageOfPlayer(session.state(), 'p1')).toBe(1)
  })

  it('answers the same kept look every frame', () => {
    const session = createScriptedSession()
    session.submit(1, setDrillPower(20))
    const source = drillLookSource()
    expect(source.lookOf(session.state(), 'p1', 1)).toBe(source.lookOf(session.state(), 'p1', 9))
  })

  it('wears no look for a player not in the state', () => {
    expect(drillLookStageOfPlayer(createScriptedSession().state(), 'nobody')).toBe(0)
  })

  it('leaves the state and its digest as they were', () => {
    const session = createScriptedSession()
    session.submit(1, setDrillPower(50))
    const digest = stateDigest(session.state())
    drillLookSource().lookOf(session.state(), 'p1', 1)
    expect(stateDigest(session.state())).toBe(digest)
  })

  it('plays no flash for any event', () => {
    const session = createScriptedSession()
    const events = session.submit(1, setDrillPower(5))
    expect(events.map((event) => drillLookSource().flashOf(event))).toEqual(events.map(() => null))
  })
})
