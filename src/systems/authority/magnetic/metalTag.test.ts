import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { ECONOMY } from '../../economy/economy'
import { ENEMY_KINDS, type MetalEnemyTags } from '../../economy/economyDefinition'
import economyFile from '../../economy/economy.json'
import { enemyTugStepMmOf } from '../../economy/magneticHazard'
import { isMetalEnemy } from '../../economy/metalEnemies'
import { readEconomy } from '../../economy/readEconomy'
import type { MagneticField } from '../../registries/magneticGround'
import { LOCKED_SCHEDULE } from '../../unlocks/unlockSchedule'
import { FACING, tileOfMillimetres } from '../../vehicle/vehiclePose'
import { planetParamsFor } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import {
  freezeEnemies,
  poseAt,
  quietTileUnderSurface,
  setPlanet,
  setUpgrade,
  spawnEnemy,
} from '../combat/combatFixtures'
import type { Enemy } from '../combat/combatState'
import { walkStepMmOf } from '../combat/enemyMovement'
import { createScriptedSession, WORLD_SEED } from '../scriptedSession'
import { tugMetalEnemies } from './enemyTug'

// The metal enemy tag (GD lock on spec #258 Q5, ticket 291): every enemy spec states `metal`,
// emp_mite is the first metal family, and only metal enemies feel a field's tug: toward the vein,
// at most 10% of their own speed, never into the rig's cell. The push-wave half is #284's.

const PLANET_2 = planetParamsFor(WORLD_SEED, 2)
const PLANET_INDEX = 2
const SPOT = quietTileUnderSurface(PLANET_2)
const SPAWN_TICK = 10
const BURROWER_TIER = 9
/** Only burrowers metal: a stand-in for a metal kind until emp_mite is built. */
const METAL_BURROWERS: MetalEnemyTags = { ...ECONOMY.enemies.metal, burrower: true }

/** A stand-in for `planet-mix`: one field round `field.vein` on every planet. */
function groundSlice(field: MagneticField): SliceDefinition {
  return {
    id: 'planet-mix',
    register: (r) =>
      r.magneticGround({
        id: 'planet-mix.test-ground',
        fieldAt: (_params, tile) => (isWithinField(field, tile) ? field : null),
        isElectrified: () => false,
      }),
  }
}

function isWithinField(field: MagneticField, tile: TilePoint): boolean {
  const dx = tile.tx - field.vein.tx
  const dy = tile.ty - field.vein.ty
  return dx * dx + dy * dy <= field.radiusTiles * field.radiusTiles
}

/** A field whose vein is the rig's own tile. */
const FIELD_ON_RIG: MagneticField = { vein: SPOT, radiusTiles: 6 }

/** Planet 2, the rig one row under the surface, a burrower in the rock `dx`, `dy` tiles off. */
function sessionWithBurrower(dx: number, dy: number) {
  const session = createScriptedSession()
  session.submit(0, setPlanet(PLANET_INDEX))
  session.submit(1, setUpgrade('hull', 8))
  session.submit(2, poseAt(SPOT, { facing: FACING.right }))
  session.submit(SPAWN_TICK, spawnEnemy('burrower', BURROWER_TIER, dx, dy))
  return session
}

function burrowerOf(state: AuthorityState): Enemy {
  const [burrower] = state.combat.enemies
  return burrower
}

function terrainOf(state: AuthorityState) {
  return { world: state.world, params: PLANET_2 }
}

function tuggedOnce(state: AuthorityState, tags: MetalEnemyTags): AuthorityState {
  return tugMetalEnemies(state, terrainOf(state), SPAWN_TICK, tags)
}

function distanceMm(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.sqrt(dx * dx + dy * dy)
}

function veinGapMm(enemy: Enemy, vein: TilePoint): number {
  return distanceMm(enemy, { x: vein.tx * 1000 + 500, y: vein.ty * 1000 + 500 })
}

describe('enemies: the metal tag (#258 Q5, ticket 291)', () => {
  it('every enemy spec states metal', () => {
    const enemyRows = LOCKED_SCHEDULE.rows
      .filter((row) => row.lane === 'Enemy')
      .map((row) => row.id)
    for (const kind of ENEMY_KINDS) expect(typeof ECONOMY.enemies.metal[kind]).toBe('boolean')
    for (const id of Object.keys(ECONOMY.enemies.metal)) {
      expect([...ENEMY_KINDS, ...enemyRows]).toContain(id)
    }
  })

  it('refuses an economy file where a built enemy does not state metal', () => {
    const broken = structuredClone(economyFile) as { enemies: { metal: Record<string, unknown> } }
    delete broken.enemies.metal.crawler
    broken.enemies.metal.burrower = 'yes'
    expect(readEconomy(broken).problems).toEqual([
      'enemies.metal.crawler must state true or false',
      'enemies.metal.burrower must state true or false',
    ])
  })

  it('emp_mite is metal', () => {
    expect(isMetalEnemy('emp_mite')).toBe(true)
    for (const kind of ENEMY_KINDS) expect(isMetalEnemy(kind)).toBe(false)
  })

  it('only metal enemies are tugged', () => {
    withRegistrations([groundSlice(FIELD_ON_RIG)], () => {
      const state = sessionWithBurrower(3, -2).state()
      expect(burrowerOf(tuggedOnce(state, ECONOMY.enemies.metal))).toEqual(burrowerOf(state))
      const tugged = burrowerOf(tuggedOnce(state, METAL_BURROWERS))
      expect(veinGapMm(tugged, SPOT)).toBeLessThan(veinGapMm(burrowerOf(state), SPOT))
    })
  })

  it('a field leaves the committed enemies where they would be without it', () => {
    const runFor = (ticks: number) => {
      const session = sessionWithBurrower(5, -3)
      session.advanceTo(SPAWN_TICK + ticks)
      return session.state().combat.enemies
    }
    const withField = withRegistrations([groundSlice(FIELD_ON_RIG)], () => runFor(120))
    expect(withField).toEqual(withRegistrations([], () => runFor(120)))
  })

  it('tugs a metal enemy toward the vein at most 10% of its own speed', () => {
    withRegistrations([groundSlice(FIELD_ON_RIG)], () => {
      const state = sessionWithBurrower(4, -3).state()
      const before = burrowerOf(state)
      const after = burrowerOf(tuggedOnce(state, METAL_BURROWERS))
      const walkStepMm = walkStepMmOf(before)
      expect(enemyTugStepMmOf(walkStepMm)).toBe(Math.floor(walkStepMm / 10))
      expect(distanceMm(before, after)).toBeGreaterThan(0)
      expect(distanceMm(before, after)).toBeLessThanOrEqual(walkStepMm / 10)
    })
  })

  it('a field never moves an enemy into the rig cell', () => {
    withRegistrations([groundSlice(FIELD_ON_RIG)], () => {
      let state = sessionWithBurrower(2, 0).state()
      for (let call = 0; call < 2000; call++) {
        state = tuggedOnce(state, METAL_BURROWERS)
        const { x, y } = burrowerOf(state)
        expect(tileOfMillimetres(x, y)).not.toEqual(SPOT)
      }
      const { x, y } = burrowerOf(state)
      expect(tileOfMillimetres(x, y)).toEqual({ tx: SPOT.tx + 1, ty: SPOT.ty })
    })
  })

  it('does not tug a frozen enemy', () => {
    withRegistrations([groundSlice(FIELD_ON_RIG)], () => {
      const session = sessionWithBurrower(3, -2)
      session.submit(SPAWN_TICK, freezeEnemies(true))
      const state = session.state()
      expect(burrowerOf(tuggedOnce(state, METAL_BURROWERS))).toEqual(burrowerOf(state))
    })
  })
})
