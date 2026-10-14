import { describe, expect, it } from 'vitest'
import { enemyHealth } from '../../economy/enemyStats'
import type { TurretShape } from '../../registries/autoGuns'
import { FACING } from '../../vehicle/vehiclePose'
import { createScriptedSession } from '../scriptedSession'
import { planetParamsOf } from '../planetOfState'
import { isLatched, isRearAttacker } from './attackerRoles'
import { CORRIDOR_MIDDLE, prepareCorridor } from './combatFixtures'
import { NO_PENDING_DRILL, type DirectorPick, type Enemy, type EnemyPhase } from './combatState'
import type { Terrain } from './enemyMovement'
import { turretSightOf } from './gunTargets'
import { inDirectorOrder, turretAimOf } from './turretAim'
import { BASE_TURRET_SHAPE } from './turretShape'
import type { VehicleTarget } from './vehicleTarget'

const RIG_X = CORRIDOR_MIDDLE.tx * 1000 + 500
const RIG_Y = CORRIDOR_MIDDLE.ty * 1000 + 500

/** The rig in the corridor's middle, drilling right: the rear is along -x. */
const RIG: VehicleTarget = {
  playerId: 'p1',
  pose: { x: RIG_X, y: RIG_Y, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.right },
  position: { x: RIG_X, y: RIG_Y },
}

const DIRECTOR: TurretShape = { ...BASE_TURRET_SHAPE, targetOrder: 'director', retargetTicks: 30 }

/** A crawler `dx, dy` mm from the rig, in `phase`; `number` sets its spawn order. */
function crawler(number: number, dx: number, dy: number, phase: EnemyPhase = 'idle'): Enemy {
  return {
    id: `e${number}`,
    kind: 'crawler',
    tier: 1,
    spawnPointId: 'debug',
    ownerId: 'p1',
    x: RIG_X + dx,
    y: RIG_Y + dy,
    health: enemyHealth('crawler', 1),
    phase,
    phaseSinceTick: 0,
    readyTick: 0,
    step: { x: 0, y: 0 },
    pendingDrill: NO_PENDING_DRILL,
    ring: null,
  }
}

function corridorTerrain(): Terrain {
  const session = createScriptedSession()
  prepareCorridor(session, FACING.right)
  const state = session.state()
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the scripted session has a planet')
  return { world: state.world, params }
}

describe('turret aim: who the fire director counts as attacking (ticket 382, TD Q3 on #319)', () => {
  it('counts an enemy winding up or lunging within contact reach as latched', () => {
    expect(isLatched(RIG, crawler(1, 0, 900, 'windup'))).toBe(true)
    expect(isLatched(RIG, crawler(1, 0, 900, 'lunge'))).toBe(true)
    expect(isLatched(RIG, crawler(1, 0, 900, 'approach'))).toBe(false)
    expect(isLatched(RIG, crawler(1, 0, 1200, 'windup'))).toBe(false)
  })

  it('never counts a pinned enemy as latched: it sits in the cone the guns leave alone', () => {
    expect(isLatched(RIG, crawler(1, 600, 0, 'pinned'))).toBe(false)
  })

  it('counts an enemy closing in, winding up or lunging from the rear zone as a rear attacker', () => {
    for (const phase of ['approach', 'windup', 'lunge'] as const) {
      expect(isRearAttacker(RIG, crawler(1, -4000, 0, phase))).toBe(true)
    }
    expect(isRearAttacker(RIG, crawler(1, -4000, 0, 'idle'))).toBe(false)
    expect(isRearAttacker(RIG, crawler(1, -4000, 0, 'recoil'))).toBe(false)
    expect(isRearAttacker(RIG, crawler(1, 0, -4000, 'approach'))).toBe(false)
  })
})

describe('turret aim: the fire director order (ticket 382)', () => {
  const nearest = crawler(1, -1500, 0, 'idle')
  const latched = crawler(2, 0, 1000, 'windup')
  const rear = crawler(3, -5000, 0, 'approach')

  it('ranks a rear attacker over a latched enemy over the nearest one', () => {
    expect(inDirectorOrder(RIG, [nearest, latched, rear]).map((enemy) => enemy.id)).toEqual([
      'e3',
      'e2',
      'e1',
    ])
  })

  it('breaks a tie in rank and distance by spawn order', () => {
    const twins = [crawler(12, -3000, 0), crawler(3, 3000, 0), crawler(7, -3000, 0)]
    expect(inDirectorOrder(RIG, twins).map((enemy) => enemy.id)).toEqual(['e3', 'e7', 'e12'])
  })

  it('shoots the rear attacker first, though another enemy is nearer', () => {
    const terrain = corridorTerrain()
    const sight = turretSightOf(terrain, RIG, DIRECTOR, false)
    const enemies = [crawler(1, -2000, 0, 'idle'), crawler(2, -5000, 0, 'approach')]
    const aim = turretAimOf(sight, enemies, { shape: DIRECTOR, heldPick: undefined, tick: 100 })
    expect(aim?.primary.id).toBe('e2')
    expect(aim?.pick).toEqual({ enemyId: 'e2', rankedTick: 100 })
  })

  it('keeps its pick until retargetTicks have passed, then ranks the pack again', () => {
    const terrain = corridorTerrain()
    const sight = turretSightOf(terrain, RIG, DIRECTOR, false)
    const enemies = [crawler(1, -2000, 0, 'idle'), crawler(2, -5000, 0, 'approach')]
    const heldPick: DirectorPick = { enemyId: 'e1', rankedTick: 100 }
    const held = turretAimOf(sight, enemies, { shape: DIRECTOR, heldPick, tick: 129 })
    expect(held?.primary.id).toBe('e1')
    expect(held?.pick).toBe(heldPick)
    const reranked = turretAimOf(sight, enemies, { shape: DIRECTOR, heldPick, tick: 130 })
    expect(reranked?.primary.id).toBe('e2')
  })

  it('ranks again at once when its pick is gone', () => {
    const terrain = corridorTerrain()
    const sight = turretSightOf(terrain, RIG, DIRECTOR, false)
    const heldPick: DirectorPick = { enemyId: 'e9', rankedTick: 100 }
    const aim = turretAimOf(sight, [crawler(1, -2000, 0)], { shape: DIRECTOR, heldPick, tick: 101 })
    expect(aim?.pick).toEqual({ enemyId: 'e1', rankedTick: 101 })
  })

  it('keeps nothing in the nearest order, and shoots the nearest', () => {
    const terrain = corridorTerrain()
    const sight = turretSightOf(terrain, RIG, BASE_TURRET_SHAPE, false)
    const enemies = [crawler(1, -5000, 0, 'approach'), crawler(2, -2000, 0, 'idle')]
    const context = { shape: BASE_TURRET_SHAPE, heldPick: undefined, tick: 100 }
    expect(turretAimOf(sight, enemies, context)).toEqual({
      primary: enemies[1],
      partners: [],
      pick: null,
    })
  })
})
