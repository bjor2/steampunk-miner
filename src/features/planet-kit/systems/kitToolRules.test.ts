import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { placeHazardCommand } from '../../../systems/authority/hazards/hazardDebugRules'
import {
  createScriptedSession,
  GROUND,
  mineTile,
  poseAbove,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { digScaleBpOf } from '../../../systems/registries/toolTradeOffs'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { PLAIN_MOTION } from '../../../systems/vehicle/motionEffects'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { kitToolIdOf } from './kitToolRules'

// The plough, tongs and vane acting by context (ticket 881, PK4c T1; the GD lock on #850): owned
// through the debug grant, each acts while its hazard is within the drill's reach and for 30
// ticks after, and only then halves the refill, takes the bite or the shove to 40% and slows its
// track by its trade-off. Owning one changes nothing away from its hazard.

const START = 100
const AWAY = { tx: GROUND.tx + 3, ty: GROUND.ty }
const PLOUGH = kitToolIdOf('scree_plough')
const TONGS = kitToolIdOf('shard_tongs')
const VANE = kitToolIdOf('vent_vane')

const grantKitItem = (itemId: string): CommandIntent =>
  ({ type: 'debug.planet-kit.grantKitItem', payload: { itemId } }) as CommandIntent

function eventsOfType<T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
}

/** Planet 1 with `kind` placed in GROUND and, when named, the tool granted. */
function sessionWith(kind: string, toolItemId: string | null): ScriptedSession {
  const session = createScriptedSession()
  if (toolItemId !== null) session.submit(START, grantKitItem(toolItemId))
  session.submit(START, placeHazardCommand(kind, GROUND.tx, GROUND.ty))
  return session
}

function contactOf<T extends 'HazardRefilled' | 'HazardBit' | 'HazardShoved'>(
  kind: string,
  toolItemId: string | null,
  type: T,
) {
  const session = sessionWith(kind, toolItemId)
  const [contact] = eventsOfType(mineTile(session, START + 1, GROUND), type)
  return contact
}

describe('kit tools acting by context', () => {
  it('starts the plough over rockfall in drill reach and logs it once, then stops after its tail', () => {
    const session = sessionWith('rockfall', 'scree_plough')
    const first = session.submit(START + 1, poseAbove(GROUND, FACING.down))
    expect(eventsOfType(first, 'ToolActingChanged')).toMatchObject([{ toolId: PLOUGH, on: true }])
    expect(
      eventsOfType(session.submit(START + 13, poseAbove(AWAY, FACING.right)), 'ToolActingChanged'),
    ).toEqual([])
    const stopped = session.submit(START + 31, poseAbove(AWAY, FACING.right))
    expect(eventsOfType(stopped, 'ToolActingChanged')).toMatchObject([
      { toolId: PLOUGH, on: false },
    ])
  })

  it('never acts away from its hazard: an owned tool leaves driving and digging plain', () => {
    const session = sessionWith('rockfall', 'scree_plough')
    const events = session.submit(START + 1, poseAbove(AWAY, FACING.right))
    expect(eventsOfType(events, 'ToolActingChanged')).toEqual([])
    expect(vehicleMotionAt(session.state(), 'p1', START + 1)).toBe(PLAIN_MOTION)
    expect(digScaleBpOf(session.vehicle())).toBe(10000)
  })

  it('takes 10% of the lift while the plough acts, and halves the refill and the crush', () => {
    const session = sessionWith('rockfall', 'scree_plough')
    session.submit(START + 1, poseAbove(GROUND, FACING.down))
    expect(vehicleMotionAt(session.state(), 'p1', START + 1).liftBoostBp).toBe(-1000)
    const bare = contactOf('rockfall', null, 'HazardRefilled')
    const ploughed = contactOf('rockfall', 'scree_plough', 'HazardRefilled')
    expect(ploughed.hullBp).toBe(Math.floor(bare.hullBp / 2))
    expect(ploughed.samples).toBeLessThan(bare.samples)
  })

  it('cuts at 75% while the tongs act and takes the bite to 40%', () => {
    const session = sessionWith('spinecrystal', 'shard_tongs')
    session.submit(START + 1, poseAbove(GROUND, FACING.down))
    expect(digScaleBpOf(session.vehicle())).toBe(7500)
    expect(contactOf('spinecrystal', null, 'HazardBit').hullBp).toBe(50)
    expect(contactOf('spinecrystal', 'shard_tongs', 'HazardBit').hullBp).toBe(20)
  })

  it('takes 30% of the drive while the vane acts and the vent’s scald to 40%', () => {
    const session = sessionWith('steamvent', 'vent_vane')
    session.submit(START + 1, poseAbove(GROUND, FACING.down))
    expect(vehicleMotionAt(session.state(), 'p1', START + 1).driveBoostBp).toBe(-3000)
    expect(session.vehicle().actingTools).toEqual([VANE])
    expect(contactOf('steamvent', null, 'HazardShoved').hullBp).toBe(50)
    expect(contactOf('steamvent', 'vent_vane', 'HazardShoved').hullBp).toBe(20)
  })

  it('acts only the tool whose hazard is in reach when the player owns all three', () => {
    const session = sessionWith('spinecrystal', 'scree_plough')
    session.submit(START, grantKitItem('shard_tongs'))
    session.submit(START, grantKitItem('vent_vane'))
    session.submit(START + 1, poseAbove(GROUND, FACING.down))
    expect(session.vehicle().actingTools).toEqual([TONGS])
  })
})
