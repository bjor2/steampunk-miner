/**
 * `BuyCasingGrade` (decision #41 Systems & Economy, the command id registered by #58): at the
 * Upgrade bay only (`wrong_bay` at the Sell bay, #37), one command raises the player's casing
 * grade by one for `ceil(48 * 1.225^(G-1))`, charged as it is priced, and logs
 * `casing_upgraded {from, to, price}`. A refused buy changes nothing. The casing grade is not a
 * vehicle track, so it never moves the visual tier. `debug.setCasingGrade` sets it directly for
 * scenarios (#41 debug API). A held step (`chain` not 0) is also refused under the service reserve
 * (`purchaseChain.ts`).
 */
import { casingUpgradePrice } from '../economy/casingPrices'
import { sub, toCanonical, type Money } from '../money'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { atBayRejection } from './dockRules'
import { moneyShortRejection } from './platformServices'
import { chainStampOf, serviceReserveRejection } from './purchaseChain'

export const CASING_RULES: { readonly buyCasingGrade: CommandRule<'buyCasingGrade'> } = {
  buyCasingGrade: {
    fields: { chain: 'wholeNumber' },
    reject: (state, { playerId, payload }) => casingRefusal(state, playerId, payload.chain),
    apply: (state, { playerId, payload }) => raiseCasingGrade(state, playerId, payload.chain),
  },
}

export const CASING_DEBUG_RULES: {
  readonly 'debug.setCasingGrade': CommandRule<'debug.setCasingGrade'>
} = {
  'debug.setCasingGrade': {
    fields: { grade: 'wholeNumber' },
    reject: (_state, { payload }) => casingGradeRangeRejection(payload.grade),
    apply: (state, { playerId, payload }) => ({
      state: withCasingGrade(state, playerId, payload.grade),
      events: [],
    }),
  },
}

/** Grade 0 is "no casing" in the world's casing layer, so a vehicle's grade is at least 1. */
export function casingGradeRangeRejection(grade: number): Rejection | null {
  if (grade >= 1) return null
  return rejectionOf('out_of_range', `grade must be at least 1, got ${grade}`)
}

/** Why buying the next casing grade in `chain` would be refused now; null when it would apply. */
export function casingRefusal(
  state: AuthorityState,
  playerId: string,
  chain: number,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => moneyShortRejection(state.players[playerId].wallet, nextCasingPrice(state, playerId)),
    () => serviceReserveRejection(state, playerId, chain, nextCasingPrice(state, playerId)),
  ])
}

/** The price of this player's next casing grade. */
export function nextCasingPrice(state: AuthorityState, playerId: string): Money {
  return casingUpgradePrice(vehicleOf(state, playerId).casingGrade)
}

function raiseCasingGrade(state: AuthorityState, playerId: string, chain: number): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const price = nextCasingPrice(state, playerId)
  const raised = withCasingGrade(state, playerId, vehicle.casingGrade + 1)
  const paid = withWallet(raised, playerId, sub(wallet, price))
  return {
    state: paid,
    events: [
      {
        type: 'CasingUpgraded',
        from: vehicle.casingGrade,
        to: vehicle.casingGrade + 1,
        price: toCanonical(price),
        ...chainStampOf(paid, playerId, chain),
      },
    ],
  }
}

function withCasingGrade(state: AuthorityState, playerId: string, grade: number): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), casingGrade: grade })
}
