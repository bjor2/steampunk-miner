/**
 * How long under-grade casing holds before it bursts (ticket 829, Systems' row in the GD lock on
 * casing grades by depth): a wall `delta` grades short of what its cell needs warns for
 *
 *   max(1 s, 20 s / 2^(delta - 1))
 *
 * so one grade short holds 20 s, two 10 s, and from six short the 1 s floor of #43's telegraph.
 * Integer ticks only: the halving is a shift, so no float or power reaches the authority.
 */
import { BURST_HOLD_ONE_SHORT_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import type { BlockWeakness } from '../../world/collapseWeakness'
import { countAsSafeInteger } from '../../wholeCount'

/** Halvings past which the hold is already under the 1 s floor; a shift by more is 0 anyway. */
const LAST_HALVING = 30

/** The hold of a wall `delta` grades short, from 1. */
export function burstHoldTicks(delta: bigint): number {
  const halvings = delta > BigInt(LAST_HALVING) ? LAST_HALVING : countAsSafeInteger(delta) - 1
  return Math.max(COLLAPSE_WARN_TICKS, BURST_HOLD_ONE_SHORT_TICKS >> halvings)
}

/** How many grades the block's weakest wall is short of what its cell needs. */
export function gradesShortOf(weakness: BlockWeakness): bigint {
  return weakness.required - weakness.weakestGrade
}
