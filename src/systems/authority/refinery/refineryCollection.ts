/**
 * Collecting refined batches (#105): only at the Sell bay, so the Sell bay stays the one place that
 * pays cash and the refinery is never a second Sell screen. `CollectRefined` pays each of this
 * player's ready batches `floorMilli(units * V(t) * valueMultiplier)` and frees its slot; another
 * player's batch, ready or not, stays where it is. The quick "Sell, repair and recharge" collects
 * first, as part of selling everything. Each batch logs `refine_collected` with what it would have
 * sold for raw and how long its money waited, the balance report's realised refine gain. The
 * payout pays the vehicle's lining bill like an ore sale (#128, `liningBill.ts`).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { rawRefineValue, refinedValue } from '../../economy/refineryEconomy'
import { add, toCanonical, ZERO_MONEY, type Money } from '../../money'
import { withWallet, type AuthorityState } from '../authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { atBayRejection } from '../dockRules'
import { payLiningBillOutOf } from '../liningBill'
import { readySlotsOf, type RefineryBatch } from './refineryBatch'

export const REFINERY_COLLECTION_RULES: {
  readonly collectRefined: CommandRule<'collectRefined'>
} = {
  collectRefined: {
    fields: {},
    reject: (state, { playerId }) =>
      firstRejection([
        () => atBayRejection(state, playerId, 'sell'),
        () => nothingToCollectRejection(state, playerId),
      ]),
    apply: (state, { playerId }) => collectReadyBatches(state, playerId),
  },
}

/** What this player's ready batches pay now; zero with none (the Sell bay's refined lines). */
export function readyRefinedValueOf(state: AuthorityState, playerId: string): Money {
  return readyBatchesOf(state, playerId).reduce(
    (total, { batch }) => add(total, refinedValue(batch.tier, batch.units)),
    ZERO_MONEY,
  )
}

/** The quick action's first step: collect when anything is ready, else nothing. */
export function collectWhenReady(state: AuthorityState, playerId: string): RuleEffect {
  if (nothingToCollectRejection(state, playerId) !== null) return unchanged(state)
  return collectReadyBatches(state, playerId)
}

function nothingToCollectRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (readyBatchesOf(state, playerId).length > 0) return null
  return rejectionOf('nothing_to_collect', 'no refined batch of yours is ready')
}

interface ReadyBatch {
  slot: number
  batch: RefineryBatch
}

function readyBatchesOf(state: AuthorityState, playerId: string): ReadyBatch[] {
  const slots = state.platform.refinerySlots
  return readySlotsOf(slots, playerId, state.tick).map((slot) => ({
    slot,
    batch: slots[slot] as RefineryBatch,
  }))
}

function collectReadyBatches(state: AuthorityState, playerId: string): RuleEffect {
  const proceeds = readyRefinedValueOf(state, playerId)
  return chainEffects(state, [
    (current) => payOutReadyBatches(current, playerId),
    (current) => payLiningBillOutOf(current, playerId, proceeds),
  ])
}

function payOutReadyBatches(state: AuthorityState, playerId: string): RuleEffect {
  const ready = readyBatchesOf(state, playerId)
  const paid = withWallet(
    state,
    playerId,
    add(state.players[playerId].wallet, readyRefinedValueOf(state, playerId)),
  )
  return {
    state: withSlotsFreed(
      paid,
      ready.map(({ slot }) => slot),
    ),
    events: ready.map((entry) => collectedEventOf(entry, state.tick)),
  }
}

function withSlotsFreed(state: AuthorityState, freed: readonly number[]): AuthorityState {
  const refinerySlots = state.platform.refinerySlots.map((slot, index) =>
    freed.includes(index) ? null : slot,
  )
  return { ...state, platform: { ...state.platform, refinerySlots } }
}

function collectedEventOf({ slot, batch }: ReadyBatch, tick: number): DomainEventBody {
  return {
    type: 'RefineCollected',
    slot,
    tier: batch.tier,
    units: batch.units,
    rawValue: toCanonical(rawRefineValue(batch.tier, batch.units)),
    value: toCanonical(refinedValue(batch.tier, batch.units)),
    waitSeconds: Math.floor((tick - batch.queuedTick) / TICKS_PER_SECOND),
    queuedPlanet: batch.queuedPlanet,
  }
}
