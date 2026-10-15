import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { enemyHealth } from '../../economy/enemyStats'
import { FACING } from '../../vehicle/vehiclePose'
import type { AuthorityState } from '../authorityState'
import { createScriptedSession } from '../scriptedSession'
import { planetParamsOf } from '../planetOfState'
import { CORRIDOR_MIDDLE, CORRIDOR_ROW, prepareCorridor } from './combatFixtures'
import { NO_PENDING_DRILL, type Enemy, type EnemyPhase } from './combatState'
import { dustTrailWarningsOf, surfacedBurrowerIdsOf } from './dustTrail'
import { walkStepMmOf } from './enemyMovement'

const RIG_X = CORRIDOR_MIDDLE.tx * 1000 + 500
/** The corridor's floor: row 296 under it is rock. */
const FLOOR_Y = CORRIDOR_ROW * 1000

interface Placing {
  kind?: Enemy['kind']
  ownerId?: string
  phase?: EnemyPhase
}

/** An enemy `number` at absolute mm `(x, y)`; a hunting burrower of p1 unless told otherwise. */
function enemyAt(number: number, x: number, y: number, placing: Placing = {}): Enemy {
  const { kind = 'burrower', ownerId = 'p1', phase = 'approach' } = placing
  return {
    id: `e${number}`,
    kind,
    tier: 1,
    spawnPointId: 'debug',
    ownerId,
    x,
    y,
    health: enemyHealth(kind, 1),
    phase,
    phaseSinceTick: 0,
    readyTick: 0,
    step: { x: 0, y: 0 },
    pendingDrill: NO_PENDING_DRILL,
    ring: null,
  }
}

/** The bored corridor with the rig in its middle and these enemies about it. */
function corridorWith(enemies: Enemy[]): AuthorityState {
  const session = createScriptedSession(['p1', 'p2'])
  prepareCorridor(session, FACING.right)
  const state = session.state()
  return { ...state, combat: { ...state.combat, enemies } }
}

const STEP_MM = walkStepMmOf(enemyAt(1, 0, 0))

describe('combat: dust trail warnings (K-pretrain, ticket 413)', () => {
  it('warns of a burrower in rock that reaches the open within the ticks, not one tick sooner', () => {
    withRegistrations([], () => {
      const state = corridorWith([enemyAt(1, RIG_X - 3000, FLOOR_Y - 3 * STEP_MM - 1)])
      expect(dustTrailWarningsOf(state, 'p1', 8, 4)).toEqual([
        { enemyId: 'e1', face: { tx: CORRIDOR_MIDDLE.tx - 3, ty: CORRIDOR_ROW } },
      ])
      expect(dustTrailWarningsOf(state, 'p1', 8, 3)).toEqual([])
    })
  })

  it('leaves out an enemy in the open, an idle one, a crawler, another hunt and one out of reach', () => {
    withRegistrations([], () => {
      const nearFloor = FLOOR_Y - STEP_MM
      const state = corridorWith([
        enemyAt(1, RIG_X - 2000, FLOOR_Y + 400),
        enemyAt(2, RIG_X - 2000, nearFloor, { phase: 'idle' }),
        enemyAt(3, RIG_X - 3000, nearFloor, { kind: 'crawler' }),
        enemyAt(4, RIG_X - 4000, nearFloor, { ownerId: 'p2' }),
        enemyAt(5, RIG_X - 6000, nearFloor),
      ])
      expect(dustTrailWarningsOf(state, 'p1', 5, 8)).toEqual([])
      expect(dustTrailWarningsOf(state, 'p1', 7, 8).map((warning) => warning.enemyId)).toEqual([
        'e5',
      ])
    })
  })

  it('lists the warnings nearest the rig first, then by id', () => {
    withRegistrations([], () => {
      const nearFloor = FLOOR_Y - STEP_MM
      const state = corridorWith([
        enemyAt(12, RIG_X - 4000, nearFloor),
        enemyAt(3, RIG_X + 4000, nearFloor),
        enemyAt(7, RIG_X - 2000, nearFloor),
      ])
      expect(dustTrailWarningsOf(state, 'p1', 8, 8).map((warning) => warning.enemyId)).toEqual([
        'e7',
        'e12',
        'e3',
      ])
    })
  })

  it('counts a burrower as just surfaced while rock is within one walking step of it', () => {
    withRegistrations([], () => {
      const state = corridorWith([
        enemyAt(1, RIG_X - 3000, FLOOR_Y + STEP_MM),
        enemyAt(2, RIG_X - 4000, FLOOR_Y + STEP_MM + 1),
        enemyAt(3, RIG_X - 5000, FLOOR_Y - 1),
      ])
      const params = planetParamsOf(state.planet)
      if (params === null) throw new Error('the corridor is on a planet')
      const ground = { state, terrain: { world: state.world, params }, tick: state.tick }
      expect([...surfacedBurrowerIdsOf(ground, 'p1')]).toEqual(['e1'])
    })
  })
})
