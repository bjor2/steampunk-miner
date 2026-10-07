/**
 * The mobility step on the authority clock (#217 `clockSteps`): it watches a rivet patch's hold
 * every tick while one runs, and clears each window on the tick it ends, so a finished effect
 * leaves the section as if it never ran. An escape thruster's burst is watched every tick too: it
 * ends at the first solid cell above the miner, and drilling that cell does not start it again. A heat sink window stays until the gauge has settled
 * past it (its vent lands only then); it never wakes the clock. With nothing running it names no
 * tick, so a quiet clock never stops for it. The tick a steam shield's curtain comes down, its
 * Mark 9 link fires (`shieldBreak.ts`), and the milestone verbs' pushes clear as they end.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import {
  mobilityOf,
  unsettledHeatSinksOf,
  withMobility,
  type MobilityState,
} from './mobilitySection'
import { moveEndsOf, withEndedMovesCleared } from './milestoneMoves'
import { isEscapeStopped } from './mobilityMotion'
import { settleRivetHold } from './rivetPatch'
import { breakSteamShield } from './shieldBreak'

export const MOBILITY_EFFECTS_STEP: ClockStep = {
  id: 'mobility.effects',
  nextTick: nextEffectTick,
  run: settleEffectsAt,
}

function nextEffectTick(state: AuthorityState): number | null {
  const ticks = playerIdsOf(state)
    .map((playerId) => dueTickOf(state, playerId))
    .filter((tick): tick is number => tick !== null)
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** Every tick while a patch holds or a thruster burns; else the first window end still ahead. */
function dueTickOf(state: AuthorityState, playerId: string): number | null {
  const value = mobilityOf(state, playerId)
  if (value.patch !== null || value.escape !== null) return state.tick + 1
  const ends = windowEndsOf(value).filter((tick) => tick > state.tick)
  return ends.length === 0 ? null : Math.min(...ends)
}

function windowEndsOf(value: MobilityState): number[] {
  return [
    value.reel?.untilTick,
    value.boost?.untilTick,
    value.escape?.untilTick,
    value.smoke?.untilTick,
    value.ballastUntilTick,
    value.shieldUntilTick,
    ...moveEndsOf(value),
  ].filter((tick): tick is number => tick !== undefined && tick > 0)
}

function settleEffectsAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => settlePlayerEffects(current, playerId, tick),
    ),
  )
}

function settlePlayerEffects(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  return chainEffects(state, [
    (current) => settleRivetHold(current, playerId, tick),
    (current) => breakSteamShield(current, playerId, tick),
    (current) => unchanged(withEndedWindowsCleared(current, playerId, tick)),
  ])
}

function withEndedWindowsCleared(
  state: AuthorityState,
  playerId: string,
  tick: number,
): AuthorityState {
  const value = mobilityOf(state, playerId)
  const cleared = {
    ...clearedWindowsOf(value, tick, vehicleOf(state, playerId).heat.settledTick),
    escape:
      value.escape !== null && isEscapeStopped(state, playerId, value.escape) ? null : value.escape,
  }
  return isSameWindows(cleared, value) ? state : withMobility(state, playerId, cleared)
}

function clearedWindowsOf(value: MobilityState, tick: number, settledTick: number): MobilityState {
  return {
    ...withEndedMovesCleared(value, tick),
    reel: runningOrNull(value.reel, tick),
    boost: runningOrNull(value.boost, tick),
    escape: runningOrNull(value.escape, tick),
    smoke: runningOrNull(value.smoke, tick),
    ballastUntilTick: tick < value.ballastUntilTick ? value.ballastUntilTick : 0,
    shieldUntilTick: tick < value.shieldUntilTick ? value.shieldUntilTick : 0,
    heatSinks: unsettledHeatSinksOf(value, settledTick),
  }
}

function runningOrNull<T extends { untilTick: number }>(window: T | null, tick: number): T | null {
  return window !== null && tick < window.untilTick ? window : null
}

/**
 * Clearing keeps every window it does not end, so an unchanged field is the same object; a field
 * it leaves out (the last push ended) is a change too.
 */
function isSameWindows(a: MobilityState, b: MobilityState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MobilityState>
  return [...keys].every((key) => a[key] === b[key])
}

/** Sorted, so two players settle in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
