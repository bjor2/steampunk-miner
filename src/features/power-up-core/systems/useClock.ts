/**
 * The power-up step on the authority clock (#217 `clockSteps`, the #200 lock): wind-ups act at
 * their tick, and a channel is watched every tick so the move that breaks it is seen on the tick
 * after the pose that shows it. With no use pending it names no tick, so a quiet clock never stops
 * for it.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import { powerUpStateOf } from './chargeState'
import { cancelChannel, isChannelBroken, resolvePendingUse } from './useResolution'

export const RESOLVE_USES_STEP: ClockStep = {
  id: 'power-up-core.resolve-uses',
  nextTick: nextUseTick,
  run: settleUsesAt,
}

function nextUseTick(state: AuthorityState): number | null {
  const ticks = playerIdsOf(state)
    .map((playerId) => dueTickOf(state, playerId))
    .filter((tick): tick is number => tick !== null)
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** A channel is due every tick while it runs; a wind-up at its act tick. */
function dueTickOf(state: AuthorityState, playerId: string): number | null {
  const pending = powerUpStateOf(state, playerId).pending
  if (pending === null) return null
  return pending.kind === 'channel' ? Math.min(state.tick + 1, pending.actTick) : pending.actTick
}

function settleUsesAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => settlePlayerUse(current, playerId, tick),
    ),
  )
}

function settlePlayerUse(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const pending = powerUpStateOf(state, playerId).pending
  if (pending === null) return unchanged(state)
  if (isChannelBroken(vehicleOf(state, playerId), pending)) return cancelChannel(state, playerId)
  if (tick < pending.actTick) return unchanged(state)
  return resolvePendingUse(state, playerId, tick)
}

/** Sorted, so two players' uses due on one tick resolve in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
