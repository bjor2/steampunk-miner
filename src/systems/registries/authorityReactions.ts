/**
 * Authority reactions (#207 TD lock, #219): how a slice folds the kernel's domain events into its
 * own section inside the authority's answer, so what it records lands with the events it heard,
 * in headless, bot and golden runs alike, and is never asserted by a client.
 *
 * The authority runs the reactions in id order after an accepted command's rule and collapse
 * watch, and after each tick the clock settles; once per player whose events the step raised.
 * `before` is the state the command or tick started from (the ore a `DrillDamageDealt` tile held is
 * read there, through `oreTypeAtTile`), `after` the state it left, with the reactions before this
 * one applied. A reaction hears only the kernel's and the slices' rule events, never another
 * reaction's, so reactions never cascade. With none registered the answer is today's.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { RuleEffect } from '../authority/commandRule'
import type { DomainEvent } from '../authority/domainEvent'
import { defineRegistry, entriesOf } from './seal'

export interface AuthorityReaction {
  id: string
  /** Its events are stamped like the player's events it heard; its state is the new `after`. */
  react(before: AuthorityState, after: AuthorityState, events: readonly DomainEvent[]): RuleEffect
}

export const AUTHORITY_REACTION_REGISTRY = defineRegistry<AuthorityReaction>('authorityReactions')

/** Every registered reaction, sorted by id. */
export function authorityReactions(): readonly AuthorityReaction[] {
  return entriesOf(AUTHORITY_REACTION_REGISTRY)
}
