/**
 * `BuyFuel {units}` (ticket 755, the GD lock on #650: fuel is bought with money at the shop and
 * never mined): at the Sell bay, where the station also recharges the energy tank, `units` whole
 * fuel units go into the vehicle's tank at this planet's unit price (`economy/jumpFuel.ts`). Logs
 * `fuel_bought` and `money_changed`.
 *
 * Since the tank track (ticket 756) the tank holds at most its level's capacity, and the #648 clamp
 * moved here with the fee: a jump costs fuel, not money, so the fuel that tops the tank up to the
 * hop to the next planet is charged `max(0, min(price, money - next on-curve price))`, and a player
 * who sold everything still gets to the next planet. Fuel past that hop pays full price. On a
 * system's last planet the next planet is the next system's first for a vehicle with the jump drive
 * (ticket 759), so the clamp holds for the jump between systems too.
 *
 * Refused, never trimmed (#8), with `out_of_range` for no units or units the tank cannot take, and
 * `money_short` for a charge the wallet cannot pay; a refused command changes nothing.
 */
import { planetPriceRow } from '../../economy/economyTables'
import { fuelPriceOf } from '../../economy/jumpFuel'
import { hopChargeOf } from '../../economy/travelCharge'
import {
  add,
  cmp,
  fromSafeInteger,
  sub,
  toCanonical,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../money'
import { fuelCapacityOf, fuelOf, hasRoomFor, withFuel } from '../../vehicle/vehicleFuel'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { atBayRejection } from '../dockRules'
import { jumpFuelTo, nextHopTargetOf } from './jumpRules'
import { moneyShortRejection } from '../platformServices'

export const FUEL_SHOP_RULES: { readonly buyFuel: CommandRule<'buyFuel'> } = {
  buyFuel: {
    fields: { units: 'wholeNumber' },
    reject: (state, { playerId, payload }) => buyFuelRefusal(state, playerId, payload.units),
    apply: (state, { playerId, payload }) => buyFuel(state, playerId, payload.units),
  },
}

/** Why buying `units` fuel would be refused now; null when it would be bought. */
export function buyFuelRefusal(
  state: AuthorityState,
  playerId: string,
  units: number,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'sell'),
    () => noUnitsRejection(units),
    () => tankFullRejection(state, playerId, units),
    () => moneyShortRejection(state.players[playerId].wallet, fuelChargeOf(state, playerId, units)),
  ])
}

/** What `units` fuel costs at this planet's shop before the clamp (the star map's list price). */
export function fuelPriceHere(state: AuthorityState, units: number): Money {
  return fuelPriceOf(state.planet.index, units)
}

/** What buying `units` fuel would charge this player now: the list price less the clamp's cut. */
export function fuelChargeOf(state: AuthorityState, playerId: string, units: number): Money {
  return sub(fuelPriceHere(state, units), hopClampCutOf(state, playerId, units))
}

/**
 * The fuel the tank lacks for the hop to the next planet, in whole units (0 when it has it): since
 * ticket 759 the jump out of a system's last planet for a vehicle with the jump drive.
 */
export function nextHopShortfallOf(state: AuthorityState, playerId: string): number {
  const hop = jumpFuelTo(state, nextHopTargetOf(state, playerId))
  const lacking = sub(hop, fuelOf(vehicleOf(state, playerId)))
  return cmp(lacking, ZERO_MONEY) > 0 ? toSafeInteger(lacking) : 0
}

/** How much the #648 clamp takes off the units of this buy that make up the next hop's fuel. */
function hopClampCutOf(state: AuthorityState, playerId: string, units: number): Money {
  const hopUnits = Math.min(units, nextHopShortfallOf(state, playerId))
  if (hopUnits === 0) return ZERO_MONEY
  const price = fuelPriceHere(state, hopUnits)
  const wallet = state.players[playerId].wallet
  return sub(price, hopChargeOf(price, planetPriceRow(state.planet.index), wallet))
}

function noUnitsRejection(units: number): Rejection | null {
  if (units >= 1) return null
  return rejectionOf('out_of_range', 'buys at least 1 fuel unit')
}

function tankFullRejection(
  state: AuthorityState,
  playerId: string,
  units: number,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  if (hasRoomFor(vehicle, fromSafeInteger(units))) return null
  const capacity = toCanonical(fuelCapacityOf(vehicle))
  return rejectionOf(
    'out_of_range',
    `the tank holds ${toCanonical(fuelOf(vehicle))} of ${capacity} fuel units`,
  )
}

function buyFuel(state: AuthorityState, playerId: string, units: number): RuleEffect {
  const wallet = state.players[playerId].wallet
  const cost = fuelChargeOf(state, playerId, units)
  const vehicle = vehicleOf(state, playerId)
  const tank = add(fuelOf(vehicle), fromSafeInteger(units))
  const fuelled = withVehicle(state, playerId, withFuel(vehicle, tank))
  return {
    state: withWallet(fuelled, playerId, sub(wallet, cost)),
    events: [
      { type: 'FuelBought', units, cost: toCanonical(cost), tank: toCanonical(tank) },
      { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, cost)) },
    ],
  }
}
