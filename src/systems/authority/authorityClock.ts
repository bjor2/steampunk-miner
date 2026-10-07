/**
 * What the authority's clock does by itself up to a tick, before any command at that tick is
 * looked at and whenever time moves with no command (#3, #11 section 5):
 *
 * - while combat is live, every tick runs: tows due at that tick first, then the enemy tick (#9),
 *   then any charge whose fuse blows at that tick (#109), then any remote charge that times out
 *   unfired (K8 #218), then the world's terrain edits (K6 #189:
 *   the live blasts' slice, then the queued power-up edits' share), then any collapse due at that
 *   tick (#43), then the slices' clock steps in id order (#217);
 * - otherwise nothing can change between ticks but a blast, a collapse, a refinery batch or flowing
 *   lava, so the clock jumps to the next tick a charge blows or times out or a terrain edit moves,
 *   a block warns into its refill or refills, a batch is ready (#105), loose lava steps (#113) or a
 *   slice's clock step has work due (#217), or to the end (tows due by then first); tows happen at
 *   their due tick (#7 strand grace, destroy delay).
 *
 * After each tick it settles, and after the closing tows, the slices' authority reactions fold the
 * events it raised into their sections (#219).
 *
 * It leaves `state.tick` at the tick it reached, so it never runs a tick twice, and a run gives the
 * same state and events however its ticks are batched.
 */
import type { AuthorityState } from './authorityState'
import { nextBlastSliceTick, sliceLiveBlasts } from './charges/blastSlice'
import { nextTerrainEditTick } from './terrain/terrainEdits'
import { applyQueuedTerrainEdits } from './terrain/terrainEditTick'
import { detonateChargesDue, nextDetonationTick } from './charges/chargeDetonation'
import { disarmExpiredCharges, nextDisarmTick } from './charges/chargeDisarm'
import { nextCollapseTick } from './collapse/collapseState'
import { runCollapseTick } from './collapse/collapseTick'
import { isCombatLive, runCombatTick, type TickOutcome } from './combat/combatTick'
import { nextLavaTick, runLavaTick } from './lava/lavaRules'
import { reactToStep } from './reactionRun'
import { announceReadyBatches, nextRefineReadyTick } from './refinery/refineryClock'
import { towVehiclesDueBy } from './vehicleTransitions'
import { nextSliceClockTick, runSliceClockSteps } from '../registries/clockSteps'

export function settleClockTo(state: AuthorityState, toTick: number): TickOutcome {
  let outcome: TickOutcome = { state, events: [] }
  while (outcome.state.tick < toTick) {
    const next = settleNextTick(outcome.state, toTick)
    outcome = { state: next.state, events: [...outcome.events, ...next.events] }
  }
  const towed = reactToStep(outcome.state, towVehiclesDueBy(outcome.state, toTick))
  return { state: towed.state, events: [...outcome.events, ...towed.events] }
}

/** One live tick, or the jump to the next scheduled one; then the reactions to what it raised. */
function settleNextTick(state: AuthorityState, toTick: number): TickOutcome {
  const tick = state.tick + 1
  const next = isCombatLive(state, tick) ? runLiveTick(state, tick) : skipQuietTicks(state, toTick)
  return reactToStep(state, next)
}

function runLiveTick(state: AuthorityState, tick: number): TickOutcome {
  return runClockSteps(state, [
    (current) => towVehiclesDueBy(current, tick),
    (current) => runCombatTick(current, tick),
    (current) => detonateChargesDue(current, tick),
    (current) => disarmExpiredCharges(current, tick),
    (current) => sliceLiveBlasts(current, tick),
    (current) => applyQueuedTerrainEdits(current, tick),
    (current) => runCollapseTick(current, tick),
    (current) => announceReadyBatches(current, tick),
    (current) => runLavaTick(current, tick),
    (current) => runSliceClockSteps(current, tick),
  ])
}

/** Up to the next blast, collapse, refinery, lava or slice step tick, if one comes before `toTick`; else to `toTick`. */
function skipQuietTicks(state: AuthorityState, toTick: number): TickOutcome {
  const stopTick = nextScheduledTick(state)
  if (stopTick === null || stopTick > toTick) {
    return { state: { ...state, tick: toTick }, events: [] }
  }
  return runClockSteps(state, [
    (current) => towVehiclesDueBy(current, stopTick),
    (current) => detonateChargesDue(current, stopTick),
    (current) => disarmExpiredCharges(current, stopTick),
    (current) => sliceLiveBlasts(current, stopTick),
    (current) => applyQueuedTerrainEdits(current, stopTick),
    (current) => runCollapseTick(current, stopTick),
    (current) => announceReadyBatches(current, stopTick),
    (current) => runLavaTick(current, stopTick),
    (current) => runSliceClockSteps(current, stopTick),
  ])
}

function nextScheduledTick(state: AuthorityState): number | null {
  const ticks = [
    nextDetonationTick(state, state.tick),
    nextDisarmTick(state, state.tick),
    nextBlastSliceTick(state),
    nextTerrainEditTick(state),
    nextCollapseTick(state.collapse, state.tick),
    nextRefineReadyTick(state.platform.refinerySlots, state.tick),
    nextLavaTick(state),
    nextSliceClockTick(state),
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
