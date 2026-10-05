/**
 * The programmatic placeholder for the two hand-authored enemies (#9 "Enemy art", #13), until the
 * commissioned parts land. The kind reads from its silhouette (a crawler is square, a burrower
 * round), the tier from the tint ramp, size and glow (`enemyTint`), so neither relies on colour
 * alone. The telegraph overrides the tint: the wind-up (the burrower's tremor) burns white-hot,
 * so a player can turn the drill toward it in time (#9: at least 24 ticks); a pinned enemy darkens
 * on the drill.
 */
import type { EnemyKind } from '../economy/economyDefinition'
import type { EnemyPhase } from '../authority/combat/combatState'
import { ART_DIRECTION } from './artDirection'
import { rgbOfHex, type Rgb } from './colour'
import { enemyGlowOf, enemySizeScaleOf, tintIndex } from './enemyTint'

export type EnemySilhouette = 'square' | 'round'

export interface EnemyLook {
  silhouette: EnemySilhouette
  colour: Rgb
  /** Width and height in metres (one tile is 1 m). */
  size: number
  /** Halo strength, 0 to 1. */
  glow: number
}

const WHITE_HOT = rgbOfHex('#ffe9a8')
const SCORCHED = rgbOfHex('#2b1a14')
/** The wind-up glows at least this much, whatever the tier, so the telegraph always reads. */
const WINDUP_GLOW = 1

const BODY: Readonly<Record<EnemyKind, { silhouette: EnemySilhouette; size: number }>> = {
  crawler: { silhouette: 'square', size: 0.8 },
  burrower: { silhouette: 'round', size: 0.9 },
}

export function enemyLookOf(kind: EnemyKind, phase: EnemyPhase, tier: number): EnemyLook {
  const tiered = tieredLookOf(kind, tier)
  if (phase === 'windup') return { ...tiered, colour: WHITE_HOT, glow: WINDUP_GLOW }
  if (phase === 'pinned') return { ...tiered, colour: SCORCHED }
  return tiered
}

function tieredLookOf(kind: EnemyKind, tier: number): EnemyLook {
  const body = BODY[kind]
  return {
    silhouette: body.silhouette,
    colour: ART_DIRECTION.enemyTint.ramp[tintIndex(tier)],
    size: body.size * enemySizeScaleOf(tier),
    glow: enemyGlowOf(tier),
  }
}
