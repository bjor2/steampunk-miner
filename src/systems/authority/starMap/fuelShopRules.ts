/**
 * `BuyFuel {units}` (ticket 755, the GD lock on #650: fuel is bought with money at the shop and
 * never mined): at the Sell bay, where the station also recharges the energy tank, `units` whole
 * fuel units go into the vehicle's tank at this planet's unit price (`economy/jumpFuel.ts`). A buy
 * of no units is refused `out_of_range` and one the wallet cannot pay `money_short`, never trimmed
 * (#8); a refused command changes nothing. Logs `fuel_bought` and `money_changed`.
 *
 * The tank has no cap until its own track (ticket 756) gives it one.
 */
import { fuelPriceOf } from '../../economy/jumpFuel'
import { add, fromSafeInteger, sub, toCanonical, type Money } from '../../money'
import { fuelOf, withFuel } from '../../vehicle/vehicleFuel'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { atBayRejection } from '../dockRules'
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
    () => moneyShortRejection(state.players[playerId].wallet, fuelPriceHere(state, units)),
  ])
}

/** What `units` fuel costs at this planet's shop. */
export function fuelPriceHere(state: AuthorityState, units: number): Money {
  return fuelPriceOf(state.planet.index, units)
}

function noUnitsRejection(units: number): Rejection | null {
  if (units >= 1) return null
  return rejectionOf('out_of_range', 'buys at least 1 fuel unit')
}

function buyFuel(state: AuthorityState, playerId: string, units: number): RuleEffect {
  const wallet = state.players[playerId].wallet
  const cost = fuelPriceHere(state, units)
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
