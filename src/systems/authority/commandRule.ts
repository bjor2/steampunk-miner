/**
 * What one command type contributes to the authority (#3): the payload fields it declares, an
 * optional check against the state that refuses it, and the pure rule that applies it. Rules for
 * play and for `debug.*` commands share this shape, so `applyCommand` treats them alike.
 */
import type { AuthorityCommand, CommandPayloads, CommandType } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody, RejectionReason } from './domainEvent'
import type { FieldKind } from './payloadFields'

export interface RuleEffect {
  state: AuthorityState
  events: DomainEventBody[]
}

export interface Rejection {
  reason: RejectionReason
  problems: string[]
}

export interface CommandRule<T extends CommandType> {
  fields: { readonly [F in keyof CommandPayloads[T]]: FieldKind }
  // Method syntax on purpose: a rule for one type is usable where any rule is expected, and
  // applyCommand only calls it with a command of that type.
  /** Why the state refuses this command, after its payload checked out; null accepts it. */
  reject?(state: AuthorityState, command: AuthorityCommand<T>): Rejection | null
  apply(state: AuthorityState, command: AuthorityCommand<T>): RuleEffect
}

export function rejectionOf(reason: RejectionReason, problem: string): Rejection {
  return { reason, problems: [problem] }
}

/** The first rejection in order, or null: each check may assume the ones before it passed. */
export function firstRejection(checks: readonly (() => Rejection | null)[]): Rejection | null {
  for (const check of checks) {
    const rejection = check()
    if (rejection !== null) return rejection
  }
  return null
}

export function unchanged(state: AuthorityState): RuleEffect {
  return { state, events: [] }
}

/** Runs rule steps in order, each on the state the previous one left, collecting the events. */
export function chainEffects(
  state: AuthorityState,
  steps: readonly ((current: AuthorityState) => RuleEffect)[],
): RuleEffect {
  return steps.reduce<RuleEffect>((effect, step) => {
    const next = step(effect.state)
    return { state: next.state, events: [...effect.events, ...next.events] }
  }, unchanged(state))
}
