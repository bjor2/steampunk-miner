/**
 * The trip counter resets at the dock (#162 4.5): the slice's authority reaction hears a player's
 * `DockEntered` and puts their income trip back to fresh, which takes the section out of the
 * state. A player who never used an income item has nothing to reset, so nothing changes.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { FRESH_TRIP, withIncomeTrip } from './incomeTrip'

export const TRIP_RESET: AuthorityReaction = { id: 'extraction.trip-reset', react: resetTripAtDock }

function resetTripAtDock(
  _before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const playerId = dockedPlayerOf(after, heard)
  if (playerId === null) return unchanged(after)
  return unchanged(withIncomeTrip(after, playerId, FRESH_TRIP))
}

/** The player whose vehicle docked in the events heard, or null when none did. */
function dockedPlayerOf(state: AuthorityState, heard: readonly DomainEvent[]): string | null {
  const playerId = heard.find((event) => event.type === 'DockEntered')?.playerId
  return playerId !== undefined && Object.hasOwn(state.players, playerId) ? playerId : null
}
