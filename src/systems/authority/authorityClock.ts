/**
 * What the authority's clock does by itself up to a tick, before any command at that tick is
 * looked at and whenever time moves with no command (#3, #11 section 5):
 *
 * - while combat is live, every tick runs: tows due at that tick first, then the enemy tick (#9),
 *   then any charge whose fuse blows at that tick (#109), then the world's terrain edits (K6 #189:
 *   the live blasts' slice, then the queued power-up edits' share), then any collapse due at that
 *   tick (#43);
 * - otherwise nothing can change between ticks but a blast, a collapse, a refinery batch or flowing
 *   lava, so the clock jumps to the next tick a charge blows or a terrain edit moves, a block warns
 *   into its refill or refills, a batch is ready (#105) or loose lava steps (#113), or to the end
 *   (tows due by then first); tows happen at their due tick (#7 strand grace, destroy delay).
 *
 * It leaves `state.tick` at the tick it reached, so it never runs a tick twice, and a run gives the
 * same state and events however its ticks are batched.
 */
import type { AuthorityState } from './authorityState'
import { nextBlastSliceTick, sliceLiveBlasts } from './charges/blastSlice'
import { nextTerrainEditTick } from './terrain/terrainEdits'
import { applyQueuedTerrainEdits } from './terrain/terrainEditTick'
import { detonateChargesDue, nextDetonationTick } from './charges/chargeDetonation'
import { nextCollapseTick } from './collapse/collapseState'
import { runCollapseTick } from './collapse/collapseTick'
import { isCombatLive, runCombatTick, type TickOutcome } from './combat/combatTick'
import { nextLavaTick, runLavaTick } from './lava/lavaRules'
import { announceReadyBatches, nextRefineReadyTick } from './refinery/refineryClock'
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
    (current) => detonateChargesDue(current, tick),
    (current) => sliceLiveBlasts(current, tick),
    (current) => applyQueuedTerrainEdits(current, tick),
    (current) => runCollapseTick(current, tick),
    (current) => announceReadyBatches(current, tick),
    (current) => runLavaTick(current, tick),
  ])
}

/** Up to the next blast, collapse, refinery or lava tick, if one comes before `toTick`; else to `toTick`. */
function skipQuietTicks(state: AuthorityState, toTick: number): TickOutcome {
  const stopTick = nextScheduledTick(state)
  if (stopTick === null || stopTick > toTick) {
    return { state: { ...state, tick: toTick }, events: [] }
  }
  return runClockSteps(state, [
    (current) => towVehiclesDueBy(current, stopTick),
    (current) => detonateChargesDue(current, stopTick),
    (current) => sliceLiveBlasts(current, stopTick),
    (current) => applyQueuedTerrainEdits(current, stopTick),
    (current) => runCollapseTick(current, stopTick),
    (current) => announceReadyBatches(current, stopTick),
    (current) => runLavaTick(current, stopTick),
  ])
}

function nextScheduledTick(state: AuthorityState): number | null {
  const ticks = [
    nextDetonationTick(state, state.tick),
    nextBlastSliceTick(state),
    nextTerrainEditTick(state),
    nextCollapseTick(state.collapse, state.tick),
    nextRefineReadyTick(state.platform.refinerySlots, state.tick),
    nextLavaTick(state),
  ].filter((tick): tick is number => tick !== null)
  return ticks.length === 0 ? null : Math.min(...ticks)
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
