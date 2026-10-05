import { describe, expect, it } from 'vitest'
import { ENEMY_KINDS } from '../economy/economyDefinition'
import { enemyLookOf } from './enemyPlaceholder'

const OTHER_PHASES = ['idle', 'approach', 'lunge', 'recoil', 'pinned'] as const

describe('enemy placeholder look', () => {
  it.each([1, 5, 9, 40, 1000])(
    'shows the wind-up differently from every other phase at tier %i',
    (tier) => {
      for (const kind of ENEMY_KINDS) {
        const windup = enemyLookOf(kind, 'windup', tier).colour
        for (const phase of OTHER_PHASES) {
          expect(enemyLookOf(kind, phase, tier).colour).not.toEqual(windup)
        }
      }
    },
  )

  it('tells a crawler from a burrower by silhouette, not colour, at the same tier', () => {
    const crawler = enemyLookOf('crawler', 'approach', 3)
    const burrower = enemyLookOf('burrower', 'approach', 3)
    expect(crawler.colour).toEqual(burrower.colour)
    expect(crawler.silhouette).not.toBe(burrower.silhouette)
  })

  it('draws a higher tier larger and brighter-glowing than a lower one', () => {
    const low = enemyLookOf('crawler', 'approach', 2)
    const high = enemyLookOf('crawler', 'approach', 11)
    expect(high.size).toBeGreaterThan(low.size)
    expect(high.glow).toBeGreaterThan(low.glow)
  })
})
