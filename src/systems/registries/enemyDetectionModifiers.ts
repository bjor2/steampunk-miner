/**
 * Slice modifiers on how far an enemy notices the vehicle (ticket 233, the GD lock on #204 Q1 c):
 * a smoke canister's cloud shrinks an enemy's detection reach. Each modifier answers a scale in
 * basis points (null when it has nothing to say); the kernel multiplies them and never lets the
 * reach fall below `itemEffectCaps.detectionFloorBp` of the enemy's own. Only the hunt's notice
 * is scaled: a wind-up or lunge already under way goes on. With nothing registered every enemy
 * hunts as it did.
 */
import { BASIS_POINTS } from '../../constants/balance'
import type { AuthorityState } from '../authority/authorityState'
import type { Enemy } from '../authority/combat/combatState'
import { ECONOMY } from '../economy/economy'
import { flooredScaleBp } from '../economy/itemEffectCaps'
import { defineRegistry, entriesOf } from './seal'

export interface EnemyDetectionModifier {
  id: string
  /** The share of its detection reach `enemy` keeps on `playerId`, in basis points; or null. */
  detectionScaleBpOf(
    state: AuthorityState,
    playerId: string,
    enemy: Enemy,
    tick: number,
  ): number | null
}

export const ENEMY_DETECTION_MODIFIER_REGISTRY =
  defineRegistry<EnemyDetectionModifier>('enemyDetectionModifiers')

/** `baseMm` after every registered modifier, in whole millimetres, never below the floor share. */
export function detectionReachMm(
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
  baseMm: number,
): number {
  const scales = detectionScalesOf(state, enemy, tick)
  if (scales.length === 0) return baseMm
  const scaleBp = flooredScaleBp(scales, ECONOMY.itemEffectCaps.detectionFloorBp)
  return Math.floor((baseMm * scaleBp) / BASIS_POINTS)
}

function detectionScalesOf(state: AuthorityState, enemy: Enemy, tick: number): number[] {
  return entriesOf(ENEMY_DETECTION_MODIFIER_REGISTRY)
    .map((modifier) => modifier.detectionScaleBpOf(state, enemy.ownerId, enemy, tick))
    .filter((scale): scale is number => scale !== null)
}
