/**
 * Slice steps on the authority clock (#217, the #200 seam lock): what a slice resolves with no
 * command of its own, such as a power-up's wind-up ending or a channel cancelling, so its spend
 * logs stay on the authority clock. They run in id order after the kernel's own clock steps.
 *
 * `nextTick` names the next tick after `state.tick` with work due, or null with none, so a quiet
 * clock stops there. `run` is called on every live tick and at every tick the clock stops at, so
 * it does nothing when nothing is due (as the lava step does). With nothing registered the clock
 * runs as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { RuleEffect } from '../authority/commandRule'
import type { TickOutcome } from '../authority/combat/combatTick'
import type { DomainEvent } from '../authority/domainEvent'
import { defineRegistry, entriesOf } from './seal'

export interface ClockStep {
  id: string
  nextTick(state: AuthorityState): number | null
  run(state: AuthorityState, tick: number): RuleEffect
}

export const CLOCK_STEP_REGISTRY = defineRegistry<ClockStep>('clockSteps')

/** Every slice step at `tick` in id order, its events stamped with the tick. */
export function runSliceClockSteps(state: AuthorityState, tick: number): TickOutcome {
  return entriesOf(CLOCK_STEP_REGISTRY).reduce<TickOutcome>(
    (outcome, step) => {
      const ran = step.run(outcome.state, tick)
      return { state: ran.state, events: [...outcome.events, ...stampedAt(ran, tick)] }
    },
    { state, events: [] },
  )
}

/**
 * The soonest tick a slice step has work due, or null. A step that names a tick already reached
 * runs at the next one, so a quiet clock always moves forward.
 */
export function nextSliceClockTick(state: AuthorityState): number | null {
  const ticks = entriesOf(CLOCK_STEP_REGISTRY)
    .map((step) => step.nextTick(state))
    .filter((tick): tick is number => tick !== null)
  return ticks.length === 0 ? null : Math.max(Math.min(...ticks), state.tick + 1)
}

function stampedAt(effect: RuleEffect, tick: number): DomainEvent[] {
  return effect.events.map((body): DomainEvent => ({ tick, ...body }))
}
