/**
 * The premium ledger's scenario call (ticket 844): `debug.setPremiumLedger {counts}` replaces the
 * player's ledger with the counts a scenario names, keyed `tier:s:p:speciesId`, each a canonical
 * decimal count from 1. Scenarios are refused, never trimmed: every malformed key or count and
 * every tier counting more than the hold holds is listed, and nothing is applied.
 */
import { vehicleOf, type AuthorityState } from '../authorityState'
import type { CommandRule, Rejection } from '../commandRule'
import {
  EMPTY_PREMIUM_LEDGER,
  isPlanetKeyText,
  isPremiumUnitsText,
  premiumOverHoldProblems,
  withPremiumCounts,
  type PremiumLedger,
} from './premiumLedger'
import { withPremiumLedger } from './premiumLedgerState'

type ScenarioCounts = Readonly<Record<string, string>>

export const PREMIUM_LEDGER_DEBUG_RULES: {
  readonly 'debug.setPremiumLedger': CommandRule<'debug.setPremiumLedger'>
} = {
  'debug.setPremiumLedger': {
    fields: { counts: 'textMap' },
    reject: (state, { playerId, payload }) =>
      scenarioLedgerRejection(state, playerId, payload.counts),
    apply: (state, { playerId, payload }) => ({
      state: withPremiumLedger(state, playerId, scenarioLedgerOf(payload.counts)),
      events: [],
    }),
  },
}

/** Every problem with a scenario's counts against the player's hold; empty when it applies. */
export function scenarioLedgerProblems(
  state: AuthorityState,
  playerId: string,
  counts: ScenarioCounts,
): string[] {
  const entryProblems = Object.entries(counts).flatMap(([key, units]) =>
    scenarioCountProblems(key, units),
  )
  if (entryProblems.length > 0) return entryProblems
  const hold = vehicleOf(state, playerId).cargo
  return premiumOverHoldProblems(scenarioLedgerOf(counts), hold, 'counts')
}

function scenarioLedgerRejection(
  state: AuthorityState,
  playerId: string,
  counts: ScenarioCounts,
): Rejection | null {
  const problems = scenarioLedgerProblems(state, playerId, counts)
  return problems.length === 0 ? null : { reason: 'invalid_payload', problems }
}

function scenarioLedgerOf(counts: ScenarioCounts): PremiumLedger {
  return withPremiumCounts(
    EMPTY_PREMIUM_LEDGER,
    Object.entries(counts).map(([key, units]) => {
      const [tier, system, planet, speciesId] = key.split(':')
      return { tier: Number.parseInt(tier, 10), origin: `${system}:${planet}`, speciesId, units }
    }),
  )
}

function scenarioCountProblems(key: string, units: string): string[] {
  const parts = key.split(':')
  const [tier, system, planet, speciesId] = parts
  const isKey =
    parts.length === 4 &&
    /^(0|[1-9]\d*)$/.test(tier) &&
    isPlanetKeyText(`${system}:${planet}`) &&
    speciesId !== ''
  return [
    ...(isKey ? [] : [`counts.${key} must be keyed tier:s:p:speciesId`]),
    ...(isPremiumUnitsText(units) ? [] : [`counts.${key} must be a whole count from 1`]),
  ]
}
