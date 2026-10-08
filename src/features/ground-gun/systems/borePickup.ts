/**
 * Ore a bore frees reaches the hold here (ticket 314; the #309 Systems budget, the kernel's 3.37
 * "loose ore" note): the kernel yields a bored ore cell (`TileDestroyed {cause: 'bore'}`) and
 * credits nothing, and this reaction picks the unit up for its shooter, read from the ground on
 * the state before the tick that opened it. It pays as drilled ore pays (`collectOreUnit`, the
 * normal sale price, no bonus), and only inside the trip's income cap: the unit's value joins the
 * `extraction` trip counter every income item shares (`roomUnderCapOf`, #201), and a unit that
 * would pass the cap is lost, the hard clamp the mineral drain applies. A full hold loses the unit
 * as drilling into it does (`StorageFull`), and it never counts toward the cap.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { collectOreUnit } from '../../../systems/authority/groundDrill'
import { minedOreOf, type MinedOre } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { add, cmp, fromCanonical, toCanonical, type Money } from '../../../systems/money'
import { withSection } from '../../../systems/registries/saveSections'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { cargoUnitsOf, statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cellAt } from '../../../systems/world/worldState'
import { EXTRACTION_TRIP_SECTION, incomeTripOf, roomUnderCapOf, tripCapAt } from '../../extraction'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** A bored ore unit the trip's income cap had no room for: lost, never paid. */
    'ground-gun.BoredOreCapped': { tx: number; ty: number; value: string }
  }
}

export const BORE_PICKUP_REACTION: AuthorityReaction = {
  id: 'ground-gun.bore-pickup',
  react: (before, after, events) => pickUpBoredOre(before, after, events),
}

function pickUpBoredOre(
  before: AuthorityState,
  after: AuthorityState,
  events: readonly DomainEvent[],
): RuleEffect {
  const playerId = shooterOf(after, events)
  const tiles = boredOreTilesOf(events)
  const params = planetParamsOf(before.planet)
  if (playerId === null || params === null || tiles.length === 0) return unchanged(after)
  return chainEffects(
    after,
    tiles.map(
      (tile) => (current: AuthorityState) =>
        pickUpUnit(current, playerId, params, oreOfTile(before, params, tile)),
    ),
  )
}

/** The ore cells the bore opened among the heard events, in the order they opened. */
export function boredOreTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' && event.cause === 'bore' && event.kind === 'ore'
      ? [{ tx: event.tx, ty: event.ty }]
      : [],
  )
}

/** The player whose events these are: a reaction hears one player's group at a time. */
function shooterOf(state: AuthorityState, events: readonly DomainEvent[]): string | null {
  const playerId = events[0]?.playerId
  return playerId !== undefined && Object.hasOwn(state.players, playerId) ? playerId : null
}

interface BoredOre {
  tile: TilePoint
  ore: MinedOre
}

function oreOfTile(before: AuthorityState, params: PlanetParams, tile: TilePoint): BoredOre {
  return { tile, ore: minedOreOf(params, tile, cellAt(before.world, params, tile)) }
}

function pickUpUnit(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { tile, ore }: BoredOre,
): RuleEffect {
  const value = oreSalePrice(ore.saleTier)
  const cap = tripCapOn(state, playerId, params, tile)
  if (!isUnderCap(state, playerId, value, cap)) return cappedUnit(state, tile, value)
  return isHoldFull(state, playerId)
    ? collectOreUnit(state, playerId, ore)
    : collectCountedUnit(state, playerId, ore, value, cap)
}

/** The unit into the hold, its value onto the trip's income counter. */
function collectCountedUnit(
  state: AuthorityState,
  playerId: string,
  ore: MinedOre,
  value: Money,
  cap: Money,
): RuleEffect {
  const collected = collectOreUnit(state, playerId, ore)
  return { ...collected, state: withTripValueAdded(collected.state, playerId, value, cap) }
}

/** The cap at the ore's own band, as the drain takes it at its use's band. */
function tripCapOn(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
): Money {
  const capacity = statsOfVehicle(vehicleOf(state, playerId)).cargoCapacity
  return tripCapAt(params.planetIndex, bandOfTile(params, tile.tx, tile.ty), capacity)
}

function isUnderCap(state: AuthorityState, playerId: string, value: Money, cap: Money): boolean {
  const room = roomUnderCapOf(fromCanonical(incomeTripOf(state, playerId).incomeItemValue), cap)
  return cmp(value, room) <= 0
}

function isHoldFull(state: AuthorityState, playerId: string): boolean {
  const vehicle = vehicleOf(state, playerId)
  return cargoUnitsOf(vehicle.cargo) >= statsOfVehicle(vehicle).cargoCapacity
}

function cappedUnit(state: AuthorityState, tile: TilePoint, value: Money): RuleEffect {
  return {
    state,
    events: [{ type: 'ground-gun.BoredOreCapped', ...tile, value: toCanonical(value) }],
  }
}

function withTripValueAdded(
  state: AuthorityState,
  playerId: string,
  value: Money,
  cap: Money,
): AuthorityState {
  const trip = incomeTripOf(state, playerId)
  const incomeItemValue = add(fromCanonical(trip.incomeItemValue), value)
  return withSection(state, playerId, EXTRACTION_TRIP_SECTION, {
    ...trip,
    incomeItemValue: toCanonical(incomeItemValue),
    tripCap: toCanonical(cap),
  })
}
