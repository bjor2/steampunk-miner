/**
 * The premium ledger as a snapshot carries it (ticket 844): the player's optional `premiumLedger`
 * key, a list of counts in key order, left out while empty, so an older save with no key restores
 * an empty ledger. A restore refuses, never trims: a malformed count, two counts under one key,
 * counts out of key order, or a tier counting more units than the hold holds is a listed problem.
 */
import { isJsonObject, isWholeNumber } from '../payloadFields'
import type { Cargo } from '../../vehicle/vehicleState'
import {
  comparePremiumKeys,
  isPlanetKeyText,
  isPremiumUnitsText,
  premiumOverHoldProblems,
  type PremiumCount,
  type PremiumLedger,
} from './premiumLedger'

const COUNT_FIELDS = ['tier', 'origin', 'speciesId', 'units']

/** A copy of the ledger under its key, or no key at all while it is empty or absent. */
export function portablePremiumLedgerField(ledger: PremiumLedger | undefined): {
  premiumLedger?: PremiumCount[]
} {
  return ledger === undefined || ledger.length === 0
    ? {}
    : { premiumLedger: ledger.map((count) => ({ ...count })) }
}

/** Every problem with a saved ledger, read against the hold it counts units of. */
export function portablePremiumLedgerProblems(
  ledger: unknown,
  hold: Cargo,
  path: string,
): string[] {
  if (ledger === undefined) return []
  if (!Array.isArray(ledger) || ledger.length === 0) {
    return [`${path} must be a non-empty list of counts, or be left out`]
  }
  const countProblems = ledger.flatMap((count, index) => countProblemsOf(count, `${path}.${index}`))
  if (countProblems.length > 0) return countProblems
  return [...orderProblemsOf(ledger, path), ...premiumOverHoldProblems(ledger, hold, path)]
}

function countProblemsOf(count: unknown, path: string): string[] {
  if (!isJsonObject(count)) return [`${path} must be an object`]
  const isValid =
    isWholeNumber(count.tier) &&
    isPlanetKeyText(count.origin) &&
    typeof count.speciesId === 'string' &&
    count.speciesId !== '' &&
    isPremiumUnitsText(count.units)
  const unknown = Object.keys(count).filter((field) => !COUNT_FIELDS.includes(field))
  return [
    ...(isValid ? [] : [`${path} must hold a whole tier, an s:p origin, a species and units`]),
    ...unknown.map((field) => `${path}.${field} is not a ledger field`),
  ]
}

function orderProblemsOf(ledger: readonly PremiumCount[], path: string): string[] {
  const isAscending = ledger.every(
    (count, index) => index === 0 || comparePremiumKeys(ledger[index - 1], count) < 0,
  )
  return isAscending ? [] : [`${path} must hold one count per key, in key order`]
}
