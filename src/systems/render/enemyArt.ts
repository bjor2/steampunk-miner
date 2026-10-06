/**
 * The Blender art an enemy kind draws with (S7c #68, #51 "crawler, burrower"): the one part of its
 * `enemy-<kind>` asset, cut from the KTX2 atlas once the asset is final. The tier and telegraph
 * still come from `enemyLookOf` (tint, size, glow): the chitin is pale, so the tint multiplies
 * over it. An enemy stands on the round planet, so its art rolls to local up like the camera does.
 */
import type { ArtCatalogue } from '../art/artCatalogue'
import { kebabOf } from '../art/artIds'
import { assetQuadsOf, atlasMapsOf, type AssetQuad, type AtlasMaps } from '../art/assetLook'
import { ENEMY_KINDS, type EnemyKind } from '../economy/economyDefinition'

export interface EnemyArt {
  quad: AssetQuad
  /** Null while the asset is a placeholder. */
  maps: AtlasMaps | null
}

export function enemyAssetIdOf(kind: EnemyKind): string {
  return `enemy-${kebabOf(kind)}`
}

export function enemyArtOf(art: ArtCatalogue, kind: EnemyKind): EnemyArt {
  const assetId = enemyAssetIdOf(kind)
  const [quad] = assetQuadsOf(art, assetId, 1)
  return { quad, maps: atlasMapsOf(art, assetId) }
}

/** The pool draws one material per kind's maps, so it draws atlas art only once every kind has it. */
export function isEveryEnemyArtFinal(art: ArtCatalogue): boolean {
  return ENEMY_KINDS.every((kind) => enemyArtOf(art, kind).maps !== null)
}

/**
 * The roll that stands art at `(x, y)` on the planet, its up pointing away from the centre: the
 * camera's `angleOfUp` taken on the position itself, so the frame loop allocates no vector.
 */
export function enemyRollOf(x: number, y: number): number {
  return Math.atan2(-x, y)
}
