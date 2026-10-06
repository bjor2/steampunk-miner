/**
 * The Upgrade bay's Lining row (spec #113 design, built by #96): the lining type is a choice on
 * top of the casing grade, never a second grade.
 *
 * - `BuyLiningType {liningType}`: at the Upgrade bay only, once the type's schedule row is open
 *   (`refractory_lining` from planet 8, #80). Unlocks the type for its `bandOre` price, logs
 *   `lining_type_unlocked`, and makes it the active type (`lining_type_selected`).
 * - `SelectLiningType {liningType}`: at the Upgrade bay, any type the vehicle owns; rings laid
 *   from then on use it. Free: the price is in the lining laid (#76, #113).
 * - `debug.setLiningType`: a scenario's lining, owned and selected, with no unlock or price.
 *
 * A refused command changes nothing.
 */
import { liningTypeUnlockPrice, STANDARD_LINING_TYPE } from '../economy/heatEconomy'
import { sub, toCanonical, type Money } from '../money'
import {
  isLiningType,
  isLiningTypeOwned,
  liningRowIdOf,
  withLiningTypeOwned,
  type VehicleLining,
} from '../vehicle/liningType'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { atBayRejection } from './dockRules'
import { isFeatureUnlocked } from './featureUnlocks'
import { moneyShortRejection } from './platformServices'

export const LINING_RULES: {
  readonly buyLiningType: CommandRule<'buyLiningType'>
  readonly selectLiningType: CommandRule<'selectLiningType'>
} = {
  buyLiningType: {
    fields: { liningType: 'text' },
    reject: (state, { playerId, payload }) => liningBuyRefusal(state, playerId, payload.liningType),
    apply: (state, { playerId, payload }) =>
      chainEffects(state, [
        (current) => unlockLiningType(current, playerId, payload.liningType),
        (current) => selectLiningType(current, playerId, payload.liningType),
      ]),
  },
  selectLiningType: {
    fields: { liningType: 'text' },
    reject: (state, { playerId, payload }) =>
      liningSelectRefusal(state, playerId, payload.liningType),
    apply: (state, { playerId, payload }) => selectLiningType(state, playerId, payload.liningType),
  },
}

export const LINING_DEBUG_RULES: {
  readonly 'debug.setLiningType': CommandRule<'debug.setLiningType'>
} = {
  'debug.setLiningType': {
    fields: { liningType: 'text' },
    reject: (_state, { payload }) => unknownLiningRejection(payload.liningType),
    apply: (state, { playerId, payload }) => {
      const lining = withLiningTypeOwned(liningOf(state, playerId), payload.liningType)
      return {
        state: withLining(state, playerId, { ...lining, active: payload.liningType }),
        events: [],
      }
    },
  },
}

/** Why unlocking `liningType` would be refused now; null when it would apply. */
export function liningBuyRefusal(
  state: AuthorityState,
  playerId: string,
  liningType: string,
): Rejection | null {
  return firstRejection([
    () => unknownLiningRejection(liningType),
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedLiningRejection(state, liningType),
    () => ownedLiningRejection(liningOf(state, playerId), liningType),
    () => moneyShortRejection(state.players[playerId].wallet, liningPriceOf(state, liningType)),
  ])
}

/** Why making `liningType` the active type would be refused now; null when it would apply. */
export function liningSelectRefusal(
  state: AuthorityState,
  playerId: string,
  liningType: string,
): Rejection | null {
  return firstRejection([
    () => unknownLiningRejection(liningType),
    () => atBayRejection(state, playerId, 'upgrade'),
    () => notOwnedLiningRejection(liningOf(state, playerId), liningType),
  ])
}

/** What unlocking `liningType` costs on the session's planet. */
export function liningPriceOf(state: AuthorityState, liningType: string): Money {
  return liningTypeUnlockPrice(liningType, state.planet.index)
}

/** Whether the Upgrade bay shows the type: its row is open here, or the vehicle already owns it. */
export function isLiningTypeOffered(
  state: AuthorityState,
  playerId: string,
  liningType: string,
): boolean {
  return (
    isLiningTypeOwned(liningOf(state, playerId), liningType) ||
    isFeatureUnlocked(state, liningRowIdOf(liningType))
  )
}

export function liningOf(state: AuthorityState, playerId: string): VehicleLining {
  return vehicleOf(state, playerId).lining
}

function unknownLiningRejection(liningType: string): Rejection | null {
  if (isLiningType(liningType)) return null
  return rejectionOf('unknown_lining_type', `${liningType} is not a lining type`)
}

function lockedLiningRejection(state: AuthorityState, liningType: string): Rejection | null {
  const rowId = liningRowIdOf(liningType)
  if (liningType === STANDARD_LINING_TYPE || isFeatureUnlocked(state, rowId)) return null
  return rejectionOf('feature_locked', `${rowId} is not open on this planet`)
}

function ownedLiningRejection(lining: VehicleLining, liningType: string): Rejection | null {
  if (!isLiningTypeOwned(lining, liningType)) return null
  return rejectionOf('lining_type_owned', `the vehicle already has ${liningType} lining`)
}

function notOwnedLiningRejection(lining: VehicleLining, liningType: string): Rejection | null {
  if (isLiningTypeOwned(lining, liningType)) return null
  return rejectionOf('lining_type_not_owned', `${liningType} lining is not unlocked`)
}

function unlockLiningType(state: AuthorityState, playerId: string, liningType: string): RuleEffect {
  const price = liningPriceOf(state, liningType)
  const owned = withLining(
    state,
    playerId,
    withLiningTypeOwned(liningOf(state, playerId), liningType),
  )
  return {
    state: withWallet(owned, playerId, sub(state.players[playerId].wallet, price)),
    events: [{ type: 'LiningTypeUnlocked', liningType, price: toCanonical(price) }],
  }
}

function selectLiningType(state: AuthorityState, playerId: string, liningType: string): RuleEffect {
  const lining = { ...liningOf(state, playerId), active: liningType }
  return {
    state: withLining(state, playerId, lining),
    events: [{ type: 'LiningTypeSelected', liningType }],
  }
}

function withLining(
  state: AuthorityState,
  playerId: string,
  lining: VehicleLining,
): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), lining })
}
