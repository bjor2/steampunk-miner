import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import type { Enemy } from '../authority/combat/combatState'
import { FACING } from '../vehicle/vehiclePose'
import {
  createAimFrame,
  gunAimTurnOf,
  gunBarrelQuadsOf,
  gunFixedQuadsOf,
  gunLookOf,
  gunPartIdsOf,
  gunTrunnionOf,
  stepGunTurn,
} from './gunLook'

/** On the planet's top at 300 m, so the vehicle's frame is the screen's. */
const TOP = { x: 0, y: 300 }

const enemyAt = (dxMetres: number, dyMetres: number) =>
  ({ id: 'e1', x: dxMetres * 1000, y: (TOP.y + dyMetres) * 1000 }) as Enemy

const aimAt = (enemies: Enemy[]) => gunAimTurnOf(TOP, FACING.right, enemies, createAimFrame())

describe('gun look (#107, #108)', () => {
  it('draws nothing before the mount, then barrel looks 1, 2 and 3 from majors 1, 6 and 12', () => {
    expect(gunPartIdsOf(SHIPPED_ART, 0)).toEqual([])
    expect([10, 59, 60, 119, 120, 160].map(gunLookOf)).toEqual([1, 1, 2, 2, 3, 3])
  })

  it('keeps mount and head at every look and swaps only the barrel', () => {
    for (const [level, barrel] of [
      [10, 't1-gun-barrel'],
      [60, 't2-gun-barrel'],
      [160, 't3-gun-barrel'],
    ] as const) {
      expect(
        gunFixedQuadsOf(SHIPPED_ART, level)
          .map((quad) => quad.partId)
          .sort(),
      ).toEqual(['t1-turret-head', 't1-turret-mount'])
      expect(gunBarrelQuadsOf(SHIPPED_ART, level).map((quad) => quad.partId)).toEqual([barrel])
    }
  })

  it('turns the barrel about the trunnion above the hull', () => {
    expect(gunTrunnionOf(SHIPPED_ART, 10)).toEqual([0.04, 0.64])
    expect(gunBarrelQuadsOf(SHIPPED_ART, 10)[0].pivot).toEqual([0, 0])
  })
})

describe('gun aim (presentation)', () => {
  it('rests with no enemy in range, and on an enemy in the drill cone', () => {
    expect(aimAt([])).toBeNull()
    expect(aimAt([enemyAt(-9, 0)])).toBeNull()
    expect(aimAt([enemyAt(4, 0)])).toBeNull()
  })

  it('turns to a rear enemy not at all, and a quarter turn to one straight above', () => {
    expect(aimAt([enemyAt(-4, 0)])).toBeCloseTo(0)
    expect(aimAt([enemyAt(0, 4)])).toBeCloseTo(-Math.PI / 2)
  })

  it('aims at the nearest of several enemies', () => {
    expect(aimAt([enemyAt(0, 6), enemyAt(-3, 0)])).toBeCloseTo(0)
  })

  it('swings at most its turn rate a step, the short way round', () => {
    expect(stepGunTurn(0, 1, 1 / 60)).toBeCloseTo(9 / 60)
    expect(stepGunTurn(0, 0.1, 1 / 60)).toBe(0.1)
    expect(stepGunTurn(3, -3, 1 / 60)).toBeGreaterThan(3)
  })
})
