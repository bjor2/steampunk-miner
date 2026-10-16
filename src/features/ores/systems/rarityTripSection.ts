/**
 * Each player's rarity trip (the `ores.rarity-trip` save section v1, TD ruling on ticket 445,
 * comment 6221725921 section 4; ticket 509): the value of the epic and mythic finds the trip clamp
 * paid in full since the last dock or rescue. It is absent while the trip is fresh, so a player who
 * never kept an epic or mythic find changes no state digest, and any save without it restores at
 * fresh. The amount is a canonical Money string, its own portable form (feature-slices.md 3.13).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  fromCanonical,
  isNonNegativeMoneyText,
  toCanonical,
  ZERO_MONEY,
} from '../../../systems/money'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import type { RarityTrip } from './rarityTripClamp'

export interface SavedRarityTrip {
  clampedValue: string
}

export const FRESH_RARITY_TRIP: SavedRarityTrip = { clampedValue: toCanonical(ZERO_MONEY) }

export const RARITY_TRIP_SECTION: SaveSection<SavedRarityTrip> = {
  id: 'ores.rarity-trip',
  version: 1,
  scope: 'player',
  initial: FRESH_RARITY_TRIP,
  problems: rarityTripProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as SavedRarityTrip,
}

export function rarityTripOf(state: AuthorityState, playerId: string): RarityTrip {
  return {
    clampedValue: fromCanonical(readSection(state, playerId, RARITY_TRIP_SECTION).clampedValue),
  }
}

export function withRarityTrip(
  state: AuthorityState,
  playerId: string,
  trip: RarityTrip,
): AuthorityState {
  const saved = { clampedValue: toCanonical(trip.clampedValue) }
  return withSection(state, playerId, RARITY_TRIP_SECTION, saved)
}

function rarityTripProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['ores.rarity-trip must be an object']
  if (isNonNegativeMoneyText(body.clampedValue)) return []
  return ['ores.rarity-trip.clampedValue must be a decimal string >= 0']
}
