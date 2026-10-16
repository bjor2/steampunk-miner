/**
 * The epic and mythic trip clamp in the real pickup path (TD ruling on ticket 445, comment
 * 6221725921 section 4, seam A'; ticket 509): the kernel's one ore pickup provider. Every unit that
 * reaches the hold on any route is priced by `paidRarityFind` against the player's rarity trip, `C`
 * the vehicle's live hold as in #162's `tripCapAt`. Only a find the clamp pays in full moves the
 * trip; every other leaves the state as it was. Deterministic and integer-bp; never a gate.
 *
 * The trip resets when the player docks or is rescued (a rescue empties the hold without a dock).
 * Extraction's 15% income cap is counted apart and stacks with this one.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { OrePickupProvider, PickedUp, PickupFind } from '../../../systems/registries/orePickup'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { NEW_RARITY_TRIP, paidRarityFind, type PaidRarityFind } from './rarityTripClamp'
import { rarityTripOf, withRarityTrip } from './rarityTripSection'

export const RARITY_PICKUP_PROVIDER: OrePickupProvider = {
  id: 'ores.rarity-pickup',
  pickupOf: pickUpRarityFind,
}

export const RARITY_TRIP_RESET: AuthorityReaction = {
  id: 'ores.rarity-trip-reset',
  react: resetRarityTripAtDockOrRescue,
}

const TRIP_ENDING_EVENTS: ReadonlySet<DomainEvent['type']> = new Set([
  'DockEntered',
  'RescueTriggered',
])

function pickUpRarityFind(state: AuthorityState, playerId: string, find: PickupFind): PickedUp {
  const cargoCapacity = statsOfVehicle(vehicleOf(state, playerId)).cargoCapacity
  const trip = rarityTripOf(state, playerId)
  const paid = paidRarityFind(trip, { ...find, cargoCapacity })
  return { saleTier: paid.saleTier, state: withPaidTrip(state, playerId, paid, trip) }
}

/** The state with the trip after the find; the same state when the find left the trip alone. */
function withPaidTrip(
  state: AuthorityState,
  playerId: string,
  paid: PaidRarityFind,
  before: PaidRarityFind['trip'],
): AuthorityState {
  return paid.trip === before ? state : withRarityTrip(state, playerId, paid.trip)
}

function resetRarityTripAtDockOrRescue(
  _before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const playerId = tripEndedPlayerOf(after, heard)
  if (playerId === null) return unchanged(after)
  return unchanged(withRarityTrip(after, playerId, NEW_RARITY_TRIP))
}

/** The player who docked or was rescued in the events heard, or null when none was. */
function tripEndedPlayerOf(state: AuthorityState, heard: readonly DomainEvent[]): string | null {
  const playerId = heard.find((event) => TRIP_ENDING_EVENTS.has(event.type))?.playerId
  return playerId !== undefined && Object.hasOwn(state.players, playerId) ? playerId : null
}
