/**
 * Slice flushes that drive a burrower out of the rock (ticket 386, K-flush; TD lock 6163443399 on
 * #319, for #388's Flushing shell): a provider answers `flushTicks` for a burrower it is shaking,
 * and the kernel walks a burrower near an exposed face out into it within that many ticks
 * (`combat/burrowerFlush.ts`). Like `enemyStepModifiers` (#375) a flush is derived each tick from
 * the slice's own state, so there is no save field and no protocol bump; it alters no cell and
 * damages nothing. The strongest flush wins: the largest answer, never a sum. With nothing
 * registered no burrower is ever flushed.
 */
import ENEMY_FLUSH_TUNING from '../../data/enemyFlush.json'
import type { AuthorityState } from '../authority/authorityState'
import type { Enemy } from '../authority/combat/combatState'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export interface EnemyFlush {
  id: string
  /**
   * How many ticks a burrower near an exposed face gets to surface, a whole number of at least 1,
   * or null for no flush on it at this tick. Asked only for burrowers.
   */
  flushTicksOf(enemy: Enemy, state: AuthorityState, tick: number): number | null
}

/** How many flushes the seal lets register (`src/data/enemyFlush.json`, a stand-in for Systems). */
export const ENEMY_FLUSH_CAP = ENEMY_FLUSH_TUNING.enemyFlushCap

/** How far, in whole tiles each way, a flushed burrower looks for a face, whatever the answer. */
export const FLUSH_REACH_CAP_TILES = ENEMY_FLUSH_TUNING.flushReachCapTiles

export const ENEMY_FLUSH_REGISTRY = defineRegistry<EnemyFlush>(
  'enemyFlushes',
  flushesOverCapProblem,
)

/** The strongest flush on the burrower at `tick`, null with none; throws on a malformed answer. */
export function flushTicksOf(state: AuthorityState, enemy: Enemy, tick: number): number | null {
  const flushes = entriesOf(ENEMY_FLUSH_REGISTRY)
  if (flushes.length === 0) return null
  return strongestFlushOf(flushes, state, enemy, tick)
}

/** The largest answer of the flushes asked in id order; null when none has an opinion. */
function strongestFlushOf(
  flushes: readonly EnemyFlush[],
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
): number | null {
  return flushes.reduce<number | null>(
    (strongest, flush) => largerFlush(strongest, checkedFlushTicksOf(flush, state, enemy, tick)),
    null,
  )
}

function largerFlush(first: number | null, second: number | null): number | null {
  if (first === null) return second
  return second === null ? first : Math.max(first, second)
}

function checkedFlushTicksOf(
  flush: EnemyFlush,
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
): number | null {
  const flushTicks = flush.flushTicksOf(enemy, state, tick)
  if (flushTicks !== null && !isWholeFlush(flushTicks)) {
    throw new RangeError(malformedFlushProblem(flush.id, flushTicks))
  }
  return flushTicks
}

function isWholeFlush(flushTicks: number): boolean {
  return Number.isSafeInteger(flushTicks) && flushTicks >= 1
}

function malformedFlushProblem(id: string, flushTicks: number): string {
  return `enemy flush "${id}" answered ${flushTicks} flush ticks: a whole number of at least 1`
}

function flushesOverCapProblem(
  registrations: readonly SealedRegistration<EnemyFlush>[],
): string | null {
  if (registrations.length <= ENEMY_FLUSH_CAP) return null
  return `${registrations.length} enemy flushes registered, at most ${ENEMY_FLUSH_CAP}`
}
