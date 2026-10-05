/**
 * What the authority's clock does by itself up to a tick, before any command at that tick is
 * looked at and whenever time moves with no command (#3, #11 section 5):
 *
 * - while combat is live, every tick runs: tows due at that tick first, then the enemy tick (#9);
 * - otherwise nothing can change between ticks, so the clock jumps, and tows happen at their due
 *   tick (#7 strand grace, destroy delay).
 *
 * It leaves `state.tick` at the tick it reached, so it never runs a tick twice.
 */
import type { AuthorityState } from './authorityState'
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
  const towed = towVehiclesDueBy(state, tick)
  const fought = runCombatTick(towed.state, tick)
  return { state: fought.state, events: [...towed.events, ...fought.events] }
}

function skipQuietTicks(state: AuthorityState, toTick: number): TickOutcome {
  return { state: { ...state, tick: toTick }, events: [] }
}
