/**
 * Each player's income-item trip (the `extraction` save section v1, #162 4.5): the one counter the
 * mineral drain, the slurry siphon and the assay and cored drain combos all read, so they share a
 * single hard clamp. It keeps the value they moved into the hold this trip (`incomeItemValue`),
 * the trip cap at the last activation's band (`tripCap`, for the #164 card line) and the share of
 * a unit the 50% yield still owes the next cell. It resets at the dock (`tripReset.ts`), so the
 * section goes back to its initial value, out of the state and the digest, between trips.
 *
 * Amounts are canonical Money strings: the section's portable form is the value itself
 * (feature-slices.md 3.13; a load never reshapes it).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  fromCanonical,
  isNonNegativeMoneyText,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

export interface IncomeTrip {
  /** What the income items moved into the hold since the last dock. */
  incomeItemValue: string
  /** The cap the last activation was held to; zero before the trip's first. */
  tripCap: string
  /** The share of an ore unit drained but not yet paid out, below one. */
  yieldCarry: string
}

const NONE = toCanonical(ZERO_MONEY)

export const FRESH_TRIP: IncomeTrip = { incomeItemValue: NONE, tripCap: NONE, yieldCarry: NONE }

export const EXTRACTION_TRIP_SECTION: SaveSection<IncomeTrip> = {
  id: 'extraction',
  version: 1,
  scope: 'player',
  initial: FRESH_TRIP,
  problems: incomeTripProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as IncomeTrip,
}

export function incomeTripOf(state: AuthorityState, playerId: string): IncomeTrip {
  return readSection(state, playerId, EXTRACTION_TRIP_SECTION)
}

export function withIncomeTrip(
  state: AuthorityState,
  playerId: string,
  trip: IncomeTrip,
): AuthorityState {
  return withSection(state, playerId, EXTRACTION_TRIP_SECTION, trip)
}

/** The trip's amounts as Money, for the rules. */
export interface IncomeTripAmounts {
  incomeItemValue: Money
  tripCap: Money
  yieldCarry: Money
}

export function amountsOfTrip(trip: IncomeTrip): IncomeTripAmounts {
  return {
    incomeItemValue: fromCanonical(trip.incomeItemValue),
    tripCap: fromCanonical(trip.tripCap),
    yieldCarry: fromCanonical(trip.yieldCarry),
  }
}

export function tripOfAmounts(amounts: IncomeTripAmounts): IncomeTrip {
  return {
    incomeItemValue: toCanonical(amounts.incomeItemValue),
    tripCap: toCanonical(amounts.tripCap),
    yieldCarry: toCanonical(amounts.yieldCarry),
  }
}

const AMOUNT_FIELDS = ['incomeItemValue', 'tripCap', 'yieldCarry'] as const

function incomeTripProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['extraction must be an object']
  return AMOUNT_FIELDS.filter((field) => !isNonNegativeMoneyText(body[field])).map(
    (field) => `extraction.${field} must be a decimal string >= 0`,
  )
}
