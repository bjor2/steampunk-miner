/**
 * `BuyFuelTank` (ticket 756; GD lock on #650, comment 6361556890): the tank's own track, separate
 * from the boiler, gated by price alone and uncapped. At the Sell bay, beside the fuel it holds,
 * the tank goes up one level for `fuelTankPriceOf(level)` (`economy/fuelTank.ts`) and holds more
 * fuel, so a jump can reach further without a stop. Refused `money_short` when the wallet cannot
 * pay; a refused command changes nothing. Logs `fuel_tank_bought` and `money_changed`.
 */
import { fuelTankPriceOf } from '../../economy/fuelTank'
import { sub, toCanonical, type Money } from '../../money'
import { fuelCapacityOf, fuelTankLevelOf, withFuelTankLevel } from '../../vehicle/vehicleFuel'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from '../authorityState'
import { firstRejection, type CommandRule, type Rejection, type RuleEffect } from '../commandRule'
import { atBayRejection } from '../dockRules'
import { moneyShortRejection } from '../platformServices'

export const FUEL_TANK_RULES: { readonly buyFuelTank: CommandRule<'buyFuelTank'> } = {
  buyFuelTank: {
    fields: {},
    reject: (state, { playerId }) => buyFuelTankRefusal(state, playerId),
    apply: (state, { playerId }) => buyFuelTank(state, playerId),
  },
}

/** Why the next tank level would be refused now; null when it would be bought. */
export function buyFuelTankRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'sell'),
    () => moneyShortRejection(state.players[playerId].wallet, nextFuelTankPriceOf(state, playerId)),
  ])
}

/** What the player's next tank level costs. */
export function nextFuelTankPriceOf(state: AuthorityState, playerId: string): Money {
  return fuelTankPriceOf(fuelTankLevelOf(vehicleOf(state, playerId)))
}

function buyFuelTank(state: AuthorityState, playerId: string): RuleEffect {
  const wallet = state.players[playerId].wallet
  const cost = nextFuelTankPriceOf(state, playerId)
  const vehicle = vehicleOf(state, playerId)
  const raised = withFuelTankLevel(vehicle, fuelTankLevelOf(vehicle) + 1)
  return {
    state: withWallet(withVehicle(state, playerId, raised), playerId, sub(wallet, cost)),
    events: [
      {
        type: 'FuelTankBought',
        level: fuelTankLevelOf(raised),
        cost: toCanonical(cost),
        capacity: toCanonical(fuelCapacityOf(raised)),
      },
      { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, cost)) },
    ],
  }
}
