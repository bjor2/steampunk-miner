import { describe, expect, it } from 'vitest'
import { placeholderQuadsOf } from '../art/placeholderLook'
import { ENEMY_KINDS } from '../economy/economyDefinition'
import { enemyArtOf, enemyAssetIdOf, enemyRollOf, isEveryEnemyArtFinal } from './enemyArt'
import { enemyLookOf } from './enemyPlaceholder'
import { SHIPPED_ART } from '../../scene/shippedArt'

describe('enemy art', () => {
  it('draws every enemy kind as the one part of its final S7c asset, cut from the atlas', () => {
    expect(isEveryEnemyArtFinal(SHIPPED_ART)).toBe(true)
    for (const kind of ENEMY_KINDS) {
      const art = enemyArtOf(SHIPPED_ART, kind)
      const assetId = enemyAssetIdOf(kind)
      const [placeholder] = placeholderQuadsOf(SHIPPED_ART, assetId, 1)
      expect(art.quad.partId).toBe(assetId)
      expect(art.quad.uv).not.toBeNull()
      expect(art.quad.size).toEqual(placeholder.size)
      expect(art.maps?.albedo).toBe(`assets/enemy/${assetId}/${assetId}.albedo.ktx2`)
    }
  })

  it('sizes the art as the placeholder look sizes the enemy at tier 1', () => {
    for (const kind of ENEMY_KINDS) {
      expect(enemyArtOf(SHIPPED_ART, kind).quad.size[0]).toBeCloseTo(
        enemyLookOf(kind, 'idle', 1).size,
        6,
      )
    }
  })

  it('rolls an enemy so its up points away from the planet centre', () => {
    expect(enemyRollOf(0, 500_000)).toBeCloseTo(0, 9)
    expect(enemyRollOf(500_000, 0)).toBeCloseTo(-Math.PI / 2, 9)
    expect(enemyRollOf(-500_000, 0)).toBeCloseTo(Math.PI / 2, 9)
    expect(Math.abs(enemyRollOf(0, -500_000))).toBeCloseTo(Math.PI, 9)
  })
})
