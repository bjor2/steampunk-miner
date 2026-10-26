/**
 * Why a pacing-bot trip ended (ticket 918, for #908's trip gate; the six causes of the GD lock on
 * #916). A rescue is a `death` (strand or wreck alike: the trace's deaths map keeps the finer
 * cause) and a hold left behind off the pad is a `cache_crate`; a trip that docked names the first
 * of these that held, in the bot's own order of turning back (`bot/botTrip.ts`):
 *
 * - `hold_full`: it docked with the hold at its capacity;
 * - `fuel`: at its turn-back (the last step at its deepest depth) the HUD's low-energy warning was
 *   up, the #33 return-reserve line (`views/energyWarning.ts`);
 * - `hull`: at its turn-back the hull stood in the warning ladder's low tier or under (spec #678);
 * - `voluntary_sell`: none of these, so the bot chose to come home.
 *
 * The lines are the HUD's own, so the trace adds no threshold of its own.
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import { cmp, div, floor, fromSafeInteger, mul, toSafeInteger, type Money } from '../systems/money'
import { energyMaxQuantaOf, statsOfVehicle } from '../systems/vehicle/vehicleState'
import { energyWarningLevel } from '../systems/views/energyWarning'
import { ladderTierOf } from '../systems/views/warningLadder'

export const TRIP_END_CAUSES = [
  'hold_full',
  'fuel',
  'hull',
  'death',
  'voluntary_sell',
  'cache_crate',
] as const

export type TripEndCause = (typeof TRIP_END_CAUSES)[number]

/** The rig's warnings at the trip's turn-back. */
export interface TurnBackReading {
  isEnergyWarned: boolean
  isHullWarned: boolean
}

const PERMILLE = 1000

export const UNWARNED: TurnBackReading = { isEnergyWarned: false, isHullWarned: false }

export function turnBackReadingOf(
  state: AuthorityState,
  playerId: string,
  depthTiles: number,
): TurnBackReading {
  return {
    isEnergyWarned: isEnergyWarned(state, playerId, depthTiles),
    isHullWarned: isHullWarned(state, playerId),
  }
}

/** The cause of a trip that docked with `cargoUnits` aboard. */
export function dockedEndCauseOf(
  state: AuthorityState,
  playerId: string,
  cargoUnits: bigint,
  turnBack: TurnBackReading,
): TripEndCause {
  const { cargoCapacity } = statsOfVehicle(state.players[playerId].vehicle)
  if (cargoUnits >= cargoCapacity) return 'hold_full'
  if (turnBack.isEnergyWarned) return 'fuel'
  if (turnBack.isHullWarned) return 'hull'
  return 'voluntary_sell'
}

function isEnergyWarned(state: AuthorityState, playerId: string, depthTiles: number): boolean {
  const vehicle = state.players[playerId].vehicle
  const level = energyWarningLevel({
    energyQuanta: vehicle.energy,
    energyMaxQuanta: energyMaxQuantaOf(vehicle),
    depthTiles,
    speedMax: statsOfVehicle(vehicle).engine.speedMax,
  })
  return level !== 'ok'
}

function isHullWarned(state: AuthorityState, playerId: string): boolean {
  const vehicle = state.players[playerId].vehicle
  return ladderTierOf(permilleOf(vehicle.hull, statsOfVehicle(vehicle).hullMax)) !== 'ok'
}

function permilleOf(value: Money, max: Money): number {
  if (cmp(value, max) >= 0) return PERMILLE
  return toSafeInteger(floor(div(mul(value, fromSafeInteger(PERMILLE)), max)))
}
