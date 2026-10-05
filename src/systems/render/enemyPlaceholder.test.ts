import { describe, expect, it } from 'vitest'
import { ENEMY_KINDS } from '../economy/economyDefinition'
import { enemyLookOf } from './enemyPlaceholder'

describe('enemy placeholder look', () => {
  it('shows the wind-up differently from every other phase of the same kind', () => {
    for (const kind of ENEMY_KINDS) {
      const windup = enemyLookOf(kind, 'windup').colour
      for (const phase of ['idle', 'approach', 'lunge', 'recoil', 'pinned'] as const) {
        expect(enemyLookOf(kind, phase).colour).not.toBe(windup)
      }
    }
  })

  it('tells a crawler from a burrower while they hunt', () => {
    expect(enemyLookOf('crawler', 'approach')).not.toEqual(enemyLookOf('burrower', 'approach'))
  })
})
