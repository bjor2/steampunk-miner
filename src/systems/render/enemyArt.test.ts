import { describe, expect, it } from 'vitest'
import { placeholderQuadsOf } from '../art/placeholderLook'
import { ENEMY_KINDS } from '../economy/economyDefinition'
import { enemyArtOf, enemyRollOf, isEveryEnemyArtFinal } from './enemyArt'
import { enemyLookOf } from './enemyPlaceholder'

describe('enemy art', () => {
  it('draws every enemy kind as the one part of its final S7c asset, cut from the atlas', () => {
    expect(isEveryEnemyArtFinal()).toBe(true)
    for (const kind of ENEMY_KINDS) {
      const art = enemyArtOf(kind)
      const [placeholder] = placeholderQuadsOf(`enemy-${kind}`, 1)
      expect(art.quad.partId).toBe(`enemy-${kind}`)
      expect(art.quad.uv).not.toBeNull()
      expect(art.quad.size).toEqual(placeholder.size)
      expect(art.maps?.albedo).toBe(`assets/enemy/enemy-${kind}/enemy-${kind}.albedo.ktx2`)
    }
  })

  it('sizes the art as the placeholder look sizes the enemy at tier 1', () => {
    for (const kind of ENEMY_KINDS) {
      expect(enemyArtOf(kind).quad.size[0]).toBeCloseTo(enemyLookOf(kind, 'idle', 1).size, 6)
    }
  })

  it('rolls an enemy so its up points away from the planet centre', () => {
    expect(enemyRollOf(0, 500_000)).toBeCloseTo(0, 9)
    expect(enemyRollOf(500_000, 0)).toBeCloseTo(-Math.PI / 2, 9)
    expect(enemyRollOf(-500_000, 0)).toBeCloseTo(Math.PI / 2, 9)
    expect(Math.abs(enemyRollOf(0, -500_000))).toBeCloseTo(Math.PI, 9)
  })
})
