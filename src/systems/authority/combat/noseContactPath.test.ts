import { describe, expect, it } from 'vitest'
import { ENEMY_CONTACT_MM } from '../../../constants/balance'
import { ZERO_MONEY } from '../../money'
import { FACING, type VehiclePose } from '../../vehicle/vehiclePose'
import { NO_PENDING_DRILL, type Enemy } from './combatState'
import { enemiesMetAlong } from './noseContactPath'

// The walked path's contact test (ticket 564): the nose's #9 test swept from where the body stood
// to the step's pose, so an enemy the nose crossed is met however far the step went.

const FROM = { x: 0, y: 0 }

function poseAt(x: number): VehiclePose {
  return { x, y: 0, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.right }
}

function enemyAt(id: string, x: number, y = 0): Enemy {
  return {
    id,
    kind: 'crawler',
    tier: 1,
    spawnPointId: 'debug',
    ownerId: 'p1',
    x,
    y,
    health: ZERO_MONEY,
    phase: 'idle',
    phaseSinceTick: 0,
    readyTick: 0,
    step: { x: 0, y: 0 },
    pendingDrill: NO_PENDING_DRILL,
    ring: null,
  }
}

const idsMet = (enemies: Enemy[], toX: number) =>
  enemiesMetAlong(enemies, { from: FROM, pose: poseAt(toX) }).map((enemy) => enemy.id)

describe('nose contact path (ticket 564)', () => {
  it('meets an enemy the body passed straight through in one long step', () => {
    expect(idsMet([enemyAt('e1', 70_000)], 140_000)).toEqual(['e1'])
  })

  it('meets what the pose test meets at the step: an enemy in reach on the nose', () => {
    expect(idsMet([enemyAt('e1', 1_000)], 0)).toEqual(['e1'])
    expect(idsMet([enemyAt('e1', ENEMY_CONTACT_MM + 1)], 0)).toEqual([])
  })

  it('meets the enemies along the path in the order the nose reaches them', () => {
    const enemies = [enemyAt('far', 9_000), enemyAt('near', 3_000, 400), enemyAt('mid', 6_000)]
    expect(idsMet(enemies, 12_000)).toEqual(['near', 'mid', 'far'])
  })

  it('never meets an enemy behind the start, or beside the path out of the front arc', () => {
    expect(idsMet([enemyAt('behind', -800)], 5_000)).toEqual([])
    expect(idsMet([enemyAt('beside', 3_000, 1_000)], 5_000)).toEqual([])
  })

  it('meets an enemy off the axis that the front arc sweeps over', () => {
    expect(idsMet([enemyAt('e1', 3_000, 700)], 5_000)).toEqual(['e1'])
  })
})
