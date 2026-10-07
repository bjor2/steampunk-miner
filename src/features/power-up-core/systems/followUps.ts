/**
 * The Mark milestones that follow a use (the GD lock on #256, build 2): once the item's Mark has
 * reached the pattern, a second press of the same slot within 30 ticks is a second tap, and the
 * slot held past the wind-up is a hold. Each is one more action at the normal charge or draw, never
 * a discount and never a yield: the item's own `activate` reads the pattern from the use and
 * changes only where or how it acts.
 *
 * The window runs from the act of the use it follows, not its press, so a channel (whose act ends
 * a 60-tick hold) can carry its Mark 3 second tap as the class mapping on #256 gives it. A
 * follow-up skips the cooldown its opener started, once, and starts its own when it acts; a gate
 * that refuses it costs nothing and leaves the opener open.
 */
import type { MilestonePattern } from '../../tech-tree'
import {
  openerOf,
  withOpener,
  type FollowUpPattern,
  type PendingUse,
  type PowerUpState,
  type UseOpener,
} from './chargeState'
import type { MarkedPowerUp } from './powerUpMarks'

/** "A second press within 30 ticks of the first" (#256), in authority ticks. */
export const FOLLOW_UP_WINDOW_TICKS = 30

/** Whether a press or hold of `slot` at `tick` follows the item's last use with `pattern`. */
export function isFollowUpOpen(
  value: PowerUpState,
  powerUp: MarkedPowerUp,
  slot: string,
  tick: number,
  pattern: FollowUpPattern,
): boolean {
  if (!powerUp.reachedMilestones.includes(pattern)) return false
  return isAnsweringOpener(openerOf(value), powerUp.itemId, slot, tick)
}

/** The follow-up a press of `slot` makes: a second tap, or null for a plain use. */
export function followUpOfPress(
  value: PowerUpState,
  powerUp: MarkedPowerUp,
  slot: string,
  tick: number,
): FollowUpPattern | null {
  return isFollowUpOpen(value, powerUp, slot, tick, 'second-tap') ? 'second-tap' : null
}

/**
 * The opener after a use acts: a plain use of an item with a follow-up reached opens one, and
 * anything else (a follow-up, an item with none) leaves none, so a follow-up answers once.
 */
export function withOpenerAfterAct(
  value: PowerUpState,
  powerUp: MarkedPowerUp,
  pending: PendingUse,
  tick: number,
): PowerUpState {
  return withOpener(value, opensFollowUp(powerUp, pending) ? openerOfAct(pending, tick) : null)
}

function opensFollowUp(powerUp: MarkedPowerUp, pending: PendingUse): boolean {
  return pending.milestone === undefined && powerUp.reachedMilestones.some(isFollowUpPattern)
}

function openerOfAct({ itemId, slot }: PendingUse, actTick: number): UseOpener {
  return { itemId, slot, actTick }
}

function isFollowUpPattern(pattern: MilestonePattern): boolean {
  return pattern === 'second-tap' || pattern === 'hold'
}

function isAnsweringOpener(
  opener: UseOpener | null,
  itemId: string,
  slot: string,
  tick: number,
): boolean {
  if (opener === null || opener.itemId !== itemId || opener.slot !== slot) return false
  return tick <= opener.actTick + FOLLOW_UP_WINDOW_TICKS
}
