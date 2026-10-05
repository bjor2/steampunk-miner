/**
 * `BuyCasingGrade` (decision #41 Systems & Economy, the command id registered by #58): at the
 * Upgrade bay only (`wrong_bay` at the Sell bay, #37), one command raises the player's casing
 * grade by one for `ceil(48 * 1.24^(G-1))`, charged as it is priced, and logs
 * `casing_upgraded {from, to, price}`. A refused buy changes nothing. The casing grade is not a
 * vehicle track, so it never moves the visual tier.
 */
import { casingUpgradePrice } from '../economy/casingPrices'
import { sub, toCanonical, type Money } from '../money'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import { firstRejection, type CommandRule, type Rejection, type RuleEffect } from './commandRule'
import { atBayRejection } from './dockRules'
import { moneyShortRejection } from './platformServices'

export const CASING_RULES: { readonly buyCasingGrade: CommandRule<'buyCasingGrade'> } = {
  buyCasingGrade: {
    fields: {},
    reject: (state, { playerId }) => casingRefusal(state, playerId),
    apply: (state, { playerId }) => raiseCasingGrade(state, playerId),
  },
}

/** Why buying the next casing grade would be refused now; null when it would apply. */
export function casingRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => moneyShortRejection(state.players[playerId].wallet, nextCasingPrice(state, playerId)),
  ])
}

/** The price of this player's next casing grade. */
export function nextCasingPrice(state: AuthorityState, playerId: string): Money {
  return casingUpgradePrice(vehicleOf(state, playerId).casingGrade)
}

function raiseCasingGrade(state: AuthorityState, playerId: string): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const price = nextCasingPrice(state, playerId)
  const raised = { ...vehicle, casingGrade: vehicle.casingGrade + 1 }
  return {
    state: withWallet(withVehicle(state, playerId, raised), playerId, sub(wallet, price)),
    events: [
      {
        type: 'CasingUpgraded',
        from: vehicle.casingGrade,
        to: raised.casingGrade,
        price: toCanonical(price),
      },
    ],
  }
}
