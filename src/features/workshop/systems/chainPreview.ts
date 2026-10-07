/**
 * What a held chain on one track could buy now (#180 section 1 "Tempt the spree" and the TD's
 * `chainPreview(track)` on #180): the steps the wallet pays in a row, the majors they cross, and
 * the service reserve the next step would have to keep. Read-only: it walks the authority's own
 * `buyUpgrade` rule on a copy of the state and submits nothing.
 *
 * Every step is walked as a held step, so the authority itself refuses it: money first (#180
 * amendment 2), then `service_reserve` where it can pay but would leave the wallet under the
 * reserve, read after every step (a boiler step raises the energy a recharge must fill).
 */
import { applyCommand, refusalOfIntent } from '../../../systems/authority/applyCommand'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { RejectionReason } from '../../../systems/authority/domainEvent'
import { serviceReserveOf } from '../../../systems/authority/serviceReserve'
import { nextUpgradePrice } from '../../../systems/authority/workshopRules'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { isMajorStep } from '../../../systems/economy/upgradeSteps'
import { add, ZERO_MONEY, type Money } from '../../../systems/money'
import { buyUpgradeCommand } from '../../../systems/platform/platformCommands'

/** The most steps one preview walks: a plaque reads "×200+" past it. */
export const PREVIEW_STEP_LIMIT = 200

/** The hold id the preview's steps carry: any held id is refused alike. */
const PREVIEW_CHAIN = 1

export type ChainPreviewStop = RejectionReason | 'preview_limit'

export interface ChainPreview {
  upgradeId: UpgradeId
  steps: number
  majors: number
  spent: Money
  /** What the step after the last one would keep back for service. */
  reserve: Money
  stoppedBy: ChainPreviewStop
}

interface PreviewWalk {
  state: AuthorityState
  steps: number
  majors: number
  spent: Money
}

export function chainPreviewOf(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
  limit: number = PREVIEW_STEP_LIMIT,
): ChainPreview {
  let walk: PreviewWalk = { state, steps: 0, majors: 0, spent: ZERO_MONEY }
  for (;;) {
    const stop = heldStepStopOf(walk.state, playerId, upgradeId)
    if (stop !== null) return previewOf(walk, playerId, upgradeId, stop)
    if (walk.steps >= limit) return previewOf(walk, playerId, upgradeId, 'preview_limit')
    walk = walkedOneStep(walk, playerId, upgradeId)
  }
}

/** Why a held step on this track would stop now; null when it would land. */
export function heldStepStopOf(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
): ChainPreviewStop | null {
  const refusal = refusalOfIntent(state, playerId, buyUpgradeCommand(upgradeId, PREVIEW_CHAIN))
  return refusal === null ? null : refusal.reason
}

function walkedOneStep(walk: PreviewWalk, playerId: string, upgradeId: UpgradeId): PreviewWalk {
  const price = nextUpgradePrice(walk.state, playerId, upgradeId)
  const fromStep = walk.state.players[playerId].vehicle.levels[upgradeId]
  return {
    state: stateAfterBuying(walk.state, playerId, upgradeId),
    steps: walk.steps + 1,
    majors: walk.majors + (isMajorStep(fromStep) ? 1 : 0),
    spent: add(walk.spent, price),
  }
}

function stateAfterBuying(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
): AuthorityState {
  const seq = state.players[playerId].lastSeq + 1
  const command = {
    playerId,
    tick: state.tick,
    seq,
    ...buyUpgradeCommand(upgradeId, PREVIEW_CHAIN),
  }
  return applyCommand(state, command).state
}

function previewOf(
  walk: PreviewWalk,
  playerId: string,
  upgradeId: UpgradeId,
  stoppedBy: ChainPreviewStop,
): ChainPreview {
  const { steps, majors, spent } = walk
  const reserve = serviceReserveOf(walk.state, playerId)
  return { upgradeId, steps, majors, spent, reserve, stoppedBy }
}
