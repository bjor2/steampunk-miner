import { describe, expect, it } from 'vitest'
import { enemyHitOnVehicle } from '../../economy/enemyStats'
import { toCanonical } from '../../money'
import { FACING } from '../../vehicle/vehiclePose'
import { planetParamsFor } from '../../world/planetParams'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, drill, WORLD_SEED } from '../scriptedSession'
import {
  freezeEnemies,
  poseAt,
  quietTileUnderSurface,
  setPlanet,
  setUpgrade,
  spawnEnemy,
} from './combatFixtures'

const PLANET_2 = planetParamsFor(WORLD_SEED, 2)
const SPOT = quietTileUnderSurface(PLANET_2)
const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

/** Planet 2, the vehicle one row under the surface facing right, tier 9 (planet 2 band 3). */
function burrowerSession(facing: (typeof FACING)[keyof typeof FACING] = FACING.right) {
  const session = createScriptedSession()
  session.submit(0, setPlanet(2))
  session.submit(1, setUpgrade('hull', 8))
  session.submit(2, poseAt(SPOT, { facing }))
  return session
}

describe('combat: the burrower (#9, #25 acceptance 8)', () => {
  it('logs enemy_type_encountered for the burrower once per run', () => {
    const session = burrowerSession()
    session.submit(10, spawnEnemy('burrower', 9, 4, -2))
    session.submit(10, spawnEnemy('burrower', 9, -4, -2))
    expect(ofType(session.events(), 'EnemyTypeEncountered')).toEqual([
      expect.objectContaining({ kind: 'burrower' }),
    ])
  })

  it('does not attack before its tremor wind-up, and hits a side with the same arc rule', () => {
    const session = burrowerSession(FACING.right)
    session.submit(10, spawnEnemy('burrower', 9, 0, -1))
    session.advanceTo(80)
    const [hit] = ofType(session.events(), 'VehicleDamaged')
    expect(hit.tick - 10).toBeGreaterThanOrEqual(24)
    expect(hit).toMatchObject({ arc: 'side', kind: 'burrower', tier: 9 })
    expect(hit.amount).toBe(toCanonical(enemyHitOnVehicle('burrower', 9, 'side')))
  })

  it('takes double from behind, like any enemy', () => {
    const session = burrowerSession(FACING.left)
    session.submit(10, spawnEnemy('burrower', 9, 3))
    session.advanceTo(80)
    const [hit] = ofType(session.events(), 'VehicleDamaged')
    expect(hit).toMatchObject({ arc: 'rear' })
    expect(hit.amount).toBe(toCanonical(enemyHitOnVehicle('burrower', 9, 'rear')))
  })

  it('swims through rock toward the vehicle and removes no tile', () => {
    const session = burrowerSession(FACING.up)
    session.submit(10, spawnEnemy('burrower', 9, 6, -3))
    const [before] = session.state().combat.enemies
    session.advanceTo(40)
    const [after] = session.state().combat.enemies
    expect(after.x).toBeLessThan(before.x)
    expect(session.state().world.chunks).toEqual({})
  })

  it('is damaged when the drill works the tile it swims in', () => {
    const session = burrowerSession(FACING.down)
    session.submit(5, freezeEnemies(true))
    session.submit(10, spawnEnemy('burrower', 9, 1, -1))
    const events = session.submit(22, drill({ tx: SPOT.tx + 1, ty: SPOT.ty - 1 }, 12))
    expect(ofType(events, 'EnemyDamaged')).toEqual([
      expect.objectContaining({ enemyId: 'e1', source: 'drill', ticks: 12 }),
    ])
  })
})
