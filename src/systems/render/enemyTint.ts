/**
 * Enemy tiers as recolour and effect intensity (#9 "Enemy art", #13): every look is a pure function
 * of the plain integer `enemyTier`, so the renderer needs no per-tier asset and any tier the debug
 * API spawns has a look. The knobs are `ART_DIRECTION.enemyTint`.
 */
import { ART_DIRECTION, type EnemyTint } from './artDirection'

const TINT: EnemyTint = ART_DIRECTION.enemyTint

/** The last colour of the ramp: tiers past it keep it (#9: `tintCap`). */
export const TINT_CAP = TINT.ramp.length - 1

/** `min(enemyTier / tiersPerTint, tintCap)`, whole steps (#9). */
export function tintIndex(enemyTier: number): number {
  return Math.min(Math.floor(enemyTier / TINT.tiersPerTint), TINT_CAP)
}

/** 0 at tier 1, rising toward 1 and never reaching it. */
export function enemyRankOf(enemyTier: number): number {
  const above = Math.max(0, enemyTier - 1)
  return above / (above + TINT.halfRankTier)
}

/** 1.0x at tier 1, approaching `sizeMax` (1.25x, #9) and never past it. */
export function enemySizeScaleOf(enemyTier: number): number {
  return 1 + (TINT.sizeMax - 1) * enemyRankOf(enemyTier)
}

/** Glow saturates toward `glowMax` with tier (#9). */
export function enemyGlowOf(enemyTier: number): number {
  return TINT.glowMax * enemyRankOf(enemyTier)
}
