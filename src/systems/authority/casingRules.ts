/**
 * `BuyCasingGrade` (decision #41 Systems & Economy, the command id registered by #58): at the
 * Upgrade bay only (`wrong_bay` at the Sell bay, #37), one command raises the player's casing
 * grade by one for `ceil(48 * 1.24^(G-1))`, charged as it is priced, and logs
 * `casing_upgraded {from, to, price}`. A refused buy changes nothing. The casing grade is not a
 * vehicle track, so it never moves the visual tier. `debug.setCasingGrade` sets it directly for
 * scenarios (#41 debug API).
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

export const CASING_RULES: { readonly buyCasingGrade: CommandRule<'buyCasingGrade'> } = {
  buyCasingGrade: {
    fields: {},
    reject: (state, { playerId }) => casingRefusal(state, playerId),
    apply: (state, { playerId }) => raiseCasingGrade(state, playerId),
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
  const raised = withCasingGrade(state, playerId, vehicle.casingGrade + 1)
  return {
    state: withWallet(raised, playerId, sub(wallet, price)),
    events: [
      {
        type: 'CasingUpgraded',
        from: vehicle.casingGrade,
        to: vehicle.casingGrade + 1,
        price: toCanonical(price),
      },
    ],
  }
}

function withCasingGrade(state: AuthorityState, playerId: string, grade: number): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), casingGrade: grade })
}
