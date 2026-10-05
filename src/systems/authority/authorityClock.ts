/**
 * What the authority's clock does by itself up to a tick, before any command at that tick is
 * looked at and whenever time moves with no command (#3, #11 section 5):
 *
 * - while combat is live, every tick runs: tows due at that tick first, then the enemy tick (#9),
 *   then any collapse due at that tick (#43);
 * - otherwise nothing can change between ticks but a collapse, so the clock jumps to the next tick
 *   a block warns into its refill or refills (tows due by then first), or to the end; tows happen
 *   at their due tick (#7 strand grace, destroy delay).
 *
 * It leaves `state.tick` at the tick it reached, so it never runs a tick twice, and a run gives the
 * same state and events however its ticks are batched.
 */
import type { AuthorityState } from './authorityState'
import { nextCollapseTick } from './collapse/collapseState'
import { runCollapseTick } from './collapse/collapseTick'
import { isCombatLive, runCombatTick, type TickOutcome } from './combat/combatTick'
import { towVehiclesDueBy } from './vehicleTransitions'

export function settleClockTo(state: AuthorityState, toTick: number): TickOutcome {
  let outcome: TickOutcome = { state, events: [] }
  while (outcome.state.tick < toTick) {
    const tick = outcome.state.tick + 1
    const next = isCombatLive(outcome.state, tick)
      ? runLiveTick(outcome.state, tick)
      : skipQuietTicks(outcome.state, toTick)
    outcome = { state: next.state, events: [...outcome.events, ...next.events] }
  }
  const towed = towVehiclesDueBy(outcome.state, toTick)
  return { state: towed.state, events: [...outcome.events, ...towed.events] }
}

function runLiveTick(state: AuthorityState, tick: number): TickOutcome {
  return runClockSteps(state, [
    (current) => towVehiclesDueBy(current, tick),
    (current) => runCombatTick(current, tick),
    (current) => runCollapseTick(current, tick),
  ])
}

/** Up to the next collapse tick, if one comes before `toTick`; else straight to `toTick`. */
function skipQuietTicks(state: AuthorityState, toTick: number): TickOutcome {
  const collapseTick = nextCollapseTick(state.collapse, state.tick)
  if (collapseTick === null || collapseTick > toTick) {
    return { state: { ...state, tick: toTick }, events: [] }
  }
  return runClockSteps(state, [
    (current) => towVehiclesDueBy(current, collapseTick),
    (current) => runCollapseTick(current, collapseTick),
  ])
}

function runClockSteps(
  state: AuthorityState,
  steps: readonly ((current: AuthorityState) => TickOutcome)[],
): TickOutcome {
  return steps.reduce<TickOutcome>(
    (outcome, step) => {
      const next = step(outcome.state)
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
}
