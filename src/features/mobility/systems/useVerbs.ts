/**
 * Which of an item's verbs a use plays (ticket 275, the GD lock on #256): the verb a sibling-link
 * fires it with, the second tap or hold it is, or its plain use. `power-up-core` only hands a use a
 * milestone the item's Mark has reached, so a verb the item has not authored falls back to the
 * plain use.
 */
import type { PowerUpUse } from '../../power-up-core'
import type { Activate } from './mobilityUses'

export interface UseVerbs {
  plain: Activate
  secondTap?: Activate
  hold?: Activate
  /** Fired by another item's sibling-link. */
  linked?: Activate
}

/** One `activate` that plays the verb the use asks for. */
export function playingVerbs(verbs: UseVerbs): Activate {
  return (state, use) => verbOf(verbs, use)(state, use)
}

function verbOf(verbs: UseVerbs, use: PowerUpUse): Activate {
  if (use.linkedFrom !== undefined) return verbs.linked ?? verbs.plain
  if (use.milestone === 'second-tap') return verbs.secondTap ?? verbs.plain
  if (use.milestone === 'hold') return verbs.hold ?? verbs.plain
  return verbs.plain
}
