/**
 * Lures a slice lays for enemies to path to (#262's resonance whistle, kernel seam ticket 361):
 * only the slice knows where a whistle sounds and until when, so it lists its live lures from its
 * own section and the hunters' step reads them here, never through an import. The step asks only
 * with the dev flag `enemy.lureRetarget` on; with it off, or nothing registered, every enemy hunts
 * the vehicle as it did.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { MillimetrePoint } from '../authority/combat/combatGeometry'
import { lureTargetOf, type Lure } from '../enemies/lureTarget'
import { defineRegistry, entriesOf } from './seal'

export interface EnemyLureSource {
  id: string
  /** Every lure the slice has sounding at `tick`, oldest first; ended ones may stay listed. */
  luresAt(state: AuthorityState, tick: number): readonly Lure[]
}

export const ENEMY_LURE_REGISTRY = defineRegistry<EnemyLureSource>('enemyLures')

/** Where `enemy` paths at `tick` for the lures of every source, in id order; null for the vehicle. */
export function lureGoalOf(
  state: AuthorityState,
  enemy: MillimetrePoint,
  tick: number,
): MillimetrePoint | null {
  return lureTargetOf(enemy, luresAt(state, tick), tick)
}

function luresAt(state: AuthorityState, tick: number): readonly Lure[] {
  return entriesOf(ENEMY_LURE_REGISTRY).flatMap((source) => source.luresAt(state, tick))
}
