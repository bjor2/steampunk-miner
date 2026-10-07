import { describe, expect, it } from 'vitest'
import { BASIS_POINTS } from '../../../constants/balance'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { ECONOMY } from '../../../systems/economy/economy'
import { fromSafeInteger, toCanonical } from '../../../systems/money'
import { detectionReachMm } from '../../../systems/registries/enemyDetectionModifiers'
import { heatStepsWithPauses } from '../../../systems/registries/heatPauses'
import { interceptedHullDamage } from '../../../systems/registries/hullDamageIntercepts'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { MM, poseAt, press, sessionWith } from '../mobilityTestSession'
import { MOBILITY_ITEM } from './itemIds'

// The survival items on ticket 233's seams: the steam shield turns aside an enemy hit and a
// collapse crush for its window, a smoke cloud blinds enemies in it, and the heat sink flask vents
// the gauge and pauses heat gain. The kernel floors each at half (`itemEffectCaps`). The flask's
// node waits on refractory lining (#162 acceptance 8).

const HIT = fromSafeInteger(40)

function usedOnce(itemId: string, facing = FACING.right): ScriptedSession {
  const session = sessionWith({ 'powerup.1': itemId }, facing)
  session.submit(10, press())
  session.advanceTo(16)
  return session
}

function enemyAt(x: number, y: number): Enemy {
  return { id: 'e1', ownerId: 'p1', x, y } as Enemy
}

describe('steam shield', () => {
  it('halves an enemy hit and a collapse crush while the curtain stands, for 120 ticks', () => {
    const session = usedOnce(MOBILITY_ITEM.steamShield)
    const taken = (tick: number, source: 'drill-contact enemy' | 'collapse') =>
      toCanonical(interceptedHullDamage(session.state(), 'p1', source, tick, HIT))
    expect(ECONOMY.itemEffectCaps.damageFloorBp).toBe(BASIS_POINTS / 2)
    expect(taken(16, 'drill-contact enemy')).toBe('2e+1')
    expect(taken(135, 'collapse')).toBe('2e+1')
    expect(taken(136, 'collapse')).toBe('4e+1')
  })
})

describe('smoke canister', () => {
  it('halves the reach of an enemy in the cloud, or hunting a miner in it, for 300 ticks', () => {
    const session = usedOnce(MOBILITY_ITEM.smokeCanister)
    const pose = session.vehicle().pose!
    const reach = (enemy: Enemy, tick: number) =>
      detectionReachMm(session.state(), enemy, tick, 8000)
    expect(reach(enemyAt(pose.x + 3 * MM, pose.y), 20)).toBe(4000)
    expect(reach(enemyAt(pose.x + 9 * MM, pose.y), 20)).toBe(4000)
    expect(reach(enemyAt(pose.x + 3 * MM, pose.y), 316)).toBe(8000)
  })

  it('leaves an enemy outside the cloud alone once the miner has slipped away', () => {
    const session = usedOnce(MOBILITY_ITEM.smokeCanister)
    const pose = session.vehicle().pose!
    session.submit(30, poseAt(pose.x + 10 * MM, pose.y, FACING.right))
    expect(detectionReachMm(session.state(), enemyAt(pose.x + 20 * MM, pose.y), 31, 8000)).toBe(
      8000,
    )
  })
})

describe('heat sink flask', () => {
  it('vents the gauge once and halves heat gain for 180 ticks, never cooling', () => {
    const session = usedOnce(MOBILITY_ITEM.heatSinkFlask)
    const steps = heatStepsWithPauses(session.state(), 'p1', 16, [{ ticks: 200, unitsPerTick: 4 }])
    expect(steps).toEqual([
      { keepBp: BASIS_POINTS / 2 },
      { ticks: 180, unitsPerTick: 2 },
      { ticks: 20, unitsPerTick: 4 },
    ])
  })

  it('is researched only once refractory lining is owned', () => {
    const session = sessionWith({})
    session.submit(2, { type: 'debug.setPlanet', payload: { planetIndex: 9 } })
    session.submit(2, { type: 'debug.setMoney', payload: { amount: '1e30' } })
    const research = (tick: number, node: string) =>
      session.submit(tick, {
        type: 'tech-tree.unlock_node',
        payload: { nodeId: `tech.mobility.${node}` },
      })
    research(3, 'grapple_winch')
    research(3, 'emergency_ballast')
    expect(refusalOf(research(4, 'heat_sink_flask'))).toBe('not_owned')
    session.submit(5, { type: 'debug.setLiningType', payload: { liningType: 'refractory' } })
    expect(refusalOf(research(6, 'heat_sink_flask'))).toBeNull()
  })
})

function refusalOf(events: readonly DomainEvent[]): string | null {
  const refused = events.find((event) => event.type === 'tech-tree.TechNodeRefused')
  return refused?.type === 'tech-tree.TechNodeRefused' ? refused.reason : null
}
