/**
 * The premium ledger in the authority state (ticket 844): each player's counts under the optional
 * `premiumLedger` key, absent while empty, so a session that never counts a premium unit keeps its
 * shape and digest. One writer: every change goes through `withPremiumLedger`, which checks the
 * invariant (each tier's counts at most the hold's units of that tier) after every mutation.
 *
 * Counted at `collectOreUnit` when the ore premium seam names the unit's species. Debited, in
 * ascending key order within the tier, on every route that takes ore out without a sale: a tow's
 * lost hold, a Refinery batch, a jettison; a sale clears the tiers it sold. Each change is one
 * `ore_premium_ledger` line with its reason.
 */
import { premiumSpeciesOfUnit } from '../../registries/orePremium'
import { vehicleOf, type AuthorityState } from '../authorityState'
import type { RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import type { MinedOre } from '../minedOre'
import { corePlanetKeyOf } from '../planetCoreBays'
import {
  EMPTY_PREMIUM_LEDGER,
  premiumOverHoldProblems,
  takePremiumOfTier,
  takePremiumOfTiers,
  withPremiumUnit,
  type PremiumLedger,
} from './premiumLedger'
import type { PremiumLedgerChange, PremiumLedgerReason } from './premiumLedgerReasons'

/** The player's counts; empty while the key is absent. */
export function premiumLedgerOf(state: AuthorityState, playerId: string): PremiumLedger {
  return state.players[playerId].premiumLedger ?? EMPTY_PREMIUM_LEDGER
}

/**
 * The player's ledger replaced, the key left out while empty. Throws when a tier would count more
 * premium units than the hold holds: a route took ore out without its debit.
 */
export function withPremiumLedger(
  state: AuthorityState,
  playerId: string,
  ledger: PremiumLedger,
): AuthorityState {
  assertWithinHold(state, playerId, ledger)
  const { premiumLedger: _held, ...player } = state.players[playerId]
  const written = ledger.length === 0 ? player : { ...player, premiumLedger: ledger }
  return { ...state, players: { ...state.players, [playerId]: written } }
}

/**
 * A stored unit counted when the seam names its premium species (the hook in `collectOreUnit`),
 * under the planet it was mined on and the tier it was stored at.
 */
export function countPremiumUnit(
  stored: RuleEffect,
  playerId: string,
  ore: MinedOre,
  tier: number,
): RuleEffect {
  const speciesId = premiumSpeciesOfUnit(stored.state, playerId, ore)
  if (speciesId === null) return stored
  const key = { tier, origin: corePlanetKeyOf(stored.state.planet), speciesId }
  const ledger = withPremiumUnit(premiumLedgerOf(stored.state, playerId), key)
  return {
    state: withPremiumLedger(stored.state, playerId, ledger),
    events: [
      ...stored.events,
      ...premiumLedgerEventsOf([{ ...key, units: '1' }], 'collect', 'mined'),
    ],
  }
}

/** `units` of the tier's counts debited in key order, the hold already lighter by them. */
export function debitPremiumUnits(
  state: AuthorityState,
  playerId: string,
  tier: number,
  units: bigint,
  reason: PremiumLedgerReason,
): RuleEffect {
  const take = takePremiumOfTier(premiumLedgerOf(state, playerId), tier, units)
  return writtenTake(state, playerId, take, reason)
}

/** Every count of the given tiers debited: the hold no longer holds those tiers. */
export function debitPremiumTiers(
  state: AuthorityState,
  playerId: string,
  tiers: readonly number[],
  reason: PremiumLedgerReason,
): RuleEffect {
  const take = takePremiumOfTiers(premiumLedgerOf(state, playerId), tiers)
  return writtenTake(state, playerId, take, reason)
}

/** Every count debited: the hold lost all its ore (a tow's rescue, #23). */
export function debitWholeLedger(
  state: AuthorityState,
  playerId: string,
  reason: PremiumLedgerReason,
): RuleEffect {
  const ledger = premiumLedgerOf(state, playerId)
  return writtenTake(state, playerId, { taken: ledger, left: EMPTY_PREMIUM_LEDGER }, reason)
}

/** One `OrePremiumLedgerChanged` per count, in ledger order. */
export function premiumLedgerEventsOf(
  counts: PremiumLedger,
  change: PremiumLedgerChange,
  reason: PremiumLedgerReason,
): DomainEventBody[] {
  return counts.map((count) => ({ type: 'OrePremiumLedgerChanged', change, reason, ...count }))
}

function writtenTake(
  state: AuthorityState,
  playerId: string,
  take: { taken: PremiumLedger; left: PremiumLedger },
  reason: PremiumLedgerReason,
): RuleEffect {
  if (take.taken.length === 0) return { state, events: [] }
  return {
    state: withPremiumLedger(state, playerId, take.left),
    events: premiumLedgerEventsOf(take.taken, 'debit', reason),
  }
}

function assertWithinHold(state: AuthorityState, playerId: string, ledger: PremiumLedger): void {
  const problems = premiumOverHoldProblems(ledger, vehicleOf(state, playerId).cargo, playerId)
  if (problems.length > 0) throw new RangeError(problems.join('; '))
}
