/**
 * The extractors on the authority clock (#217 `clockSteps`, ticket 237): a tune is watched every
 * tick until it rings or breaks, and a pull acts at its tick. With neither under way it names no
 * tick, so a quiet clock never stops for it; players settle in id order, the same on every machine.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, type RuleEffect } from '../../../systems/authority/commandRule'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import { extractorStateOf } from './extractorState'
import { nextPullTick, settlePull } from './pulling'
import { nextTuningTick, settleTuning } from './tuning'

export const EXTRACTOR_CLOCK_STEP: ClockStep = {
  id: 'mining-gates.extractor-clock',
  nextTick: nextExtractorTick,
  run: settleExtractorsAt,
}

function nextExtractorTick(state: AuthorityState): number | null {
  const ticks = playerIdsOf(state)
    .map((playerId) => extractorStateOf(state, playerId))
    .flatMap((value) => [nextTuningTick(value, state.tick), nextPullTick(value)])
    .filter((tick): tick is number => tick !== null)
  return ticks.length === 0 ? null : Math.min(...ticks)
}

function settleExtractorsAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).flatMap((playerId) => [
      (current: AuthorityState) => settleTuning(current, playerId, tick),
      (current: AuthorityState) => settlePull(current, playerId, tick),
    ]),
  )
}

function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
