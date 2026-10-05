import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical } from '../../money'
import { FACING } from '../../vehicle/vehiclePose'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { CORRIDOR_MIDDLE, poseAt, prepareCorridor, spawnEnemy } from './combatFixtures'

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

/** A tier 1 crawler three tiles to the vehicle's right, coming along the corridor. */
function fightFacing(facing: (typeof FACING)[keyof typeof FACING]) {
  const session = createScriptedSession()
  const start = prepareCorridor(session, facing)
  session.submit(start, spawnEnemy('crawler', 1, 3))
  return { session, start }
}

function hitsIn(session: ScriptedSession) {
  return ofType(session.events(), 'VehicleDamaged')
}

describe('combat: hits on the vehicle (#9, #25 acceptance 2)', () => {
  it.each([
    ['front', FACING.right, '4.9', '120.54'],
    ['side', FACING.up, '19.6', '105.84'],
    ['rear', FACING.left, '39.2', '86.24'],
  ] as const)(
    'takes a %s hit of exactly %s off an on-curve hull',
    (arc, facing, amount, hullAfter) => {
      const { session, start } = fightFacing(facing)
      session.advanceTo(start + 80)
      const [hit] = hitsIn(session)
      expect(hit).toMatchObject({ arc, kind: 'crawler', tier: 1, enemyId: 'e1' })
      expect(hit.amount).toBe(toCanonical(fromCanonical(amount)))
      expect(hit.hullAfter).toBe(toCanonical(fromCanonical(hullAfter)))
      expect(toCanonical(session.vehicle().hull)).toBe(hit.hullAfter)
    },
  )

  it('telegraphs every hit: no damage lands within 24 ticks of the wind-up starting', () => {
    const { session, start } = fightFacing(FACING.up)
    session.advanceTo(start + 80)
    expect(hitsIn(session)[0].tick - start).toBeGreaterThanOrEqual(24)
  })

  it('takes nothing from a second enemy hitting in the same tick, inside the 20-tick grace', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.up)
    session.submit(start, spawnEnemy('crawler', 1, 3))
    session.submit(start, spawnEnemy('crawler', 1, -3))
    session.advanceTo(start + 80)
    expect(hitsIn(session)).toHaveLength(1)
    expect(toCanonical(session.vehicle().hull)).toBe(toCanonical(fromCanonical('105.84')))
  })

  it('deals nothing to the enemy on a side or rear hit and sends it back for its recoil', () => {
    const { session, start } = fightFacing(FACING.left)
    for (let tick = start + 1; hitsIn(session).length === 0; tick++) session.advanceTo(tick)
    session.advanceTo(hitsIn(session)[0].tick + 10)
    const [enemy] = session.state().combat.enemies
    expect(enemy.phase).toBe('recoil')
    expect(toCanonical(enemy.health)).toBe(toCanonical(fromCanonical('7.84')))
    expect(enemy.x).toBeGreaterThan(CORRIDOR_MIDDLE.tx * 1000 + 500 + 1100)
    expect(ofType(session.events(), 'EnemyDamaged')).toEqual([])
  })
})

describe('combat: the pinned enemy (#9, #25 acceptance 3)', () => {
  it('kills a tier 1 crawler on the nose of a level 13 drill in 72 ticks, at 4 quanta a tick', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, spawnEnemy('crawler', 1, 1))
    const energyBefore = session.vehicle().energy
    session.advanceTo(start + 1)
    expect(session.state().combat.enemies[0].phase).toBe('pinned')
    session.advanceTo(start + 100)
    const [killed] = ofType(session.events(), 'EnemyKilled')
    const pinnedTicks = killed.tick - (start + 1)
    expect(killed).toMatchObject({ kind: 'crawler', tier: 1, by: 'drill' })
    expect(Math.abs(pinnedTicks - 72)).toBeLessThanOrEqual(1)
    expect(energyBefore - session.vehicle().energy).toBe(4 * pinnedTicks)
    expect(session.state().combat.enemies).toEqual([])
  })

  it('logs the drill damage in sums of at most 30 ticks that add up to the kill', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, spawnEnemy('crawler', 1, 1))
    session.advanceTo(start + 100)
    const damaged = ofType(session.events(), 'EnemyDamaged')
    expect(damaged.map((event) => event.ticks)).toEqual([30, 30, 12])
    expect(damaged.every((event) => event.enemyId === 'e1')).toBe(true)
    expect(damaged.every((event) => event.source === 'drill' && event.arc === 'front')).toBe(true)
  })

  it('pins a front lunge on the head after its front hit, and drills it dead', () => {
    const { session, start } = fightFacing(FACING.right)
    session.advanceTo(start + 140)
    expect(hitsIn(session)[0].arc).toBe('front')
    expect(ofType(session.events(), 'EnemyKilled')).toHaveLength(1)
  })

  it('lets the pin go when the head swivels away, flushing the damage dealt so far', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, spawnEnemy('crawler', 1, 1))
    session.submit(start + 20, poseAt(CORRIDOR_MIDDLE, { facing: FACING.up }))
    session.advanceTo(start + 22)
    const [enemy] = session.state().combat.enemies
    expect(enemy.phase).toBe('recoil')
    // Pinned at start+1, drilled from start+2 through start+20, released at start+21.
    expect(ofType(session.events(), 'EnemyDamaged').map((event) => event.ticks)).toEqual([19])
    expect(ofType(session.events(), 'EnemyKilled')).toEqual([])
  })
})
