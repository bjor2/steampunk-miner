/**
 * `BuyJumpDrive` (ticket 759; the GD lock on #650, comment 6361556890: "a new jump-drive stats.json
 * row", a money-priced node with a visible part on the rig): at the Sell bay, beside the fuel and
 * the tank, the vehicle is fitted with the jump drive once, for `jumpDrivePrice()`
 * (`economy/systemJump.ts`), and its jumps may cross into another solar system. The purchase is
 * anchored on the `jump_drive` row of the locked schedule, which prices it and never locks it
 * (Bjor's price-only ruling on #411, `featureSales.ts`).
 *
 * Refused, in this order: away from the Sell bay, `jump_drive_owned` for a second drive,
 * `not_for_sale` while its row ships nothing, and `money_short`. A refused command changes nothing.
 * Logs `jump_drive_bought` and `money_changed`.
 */
import { jumpDrivePrice } from '../../economy/systemJump'
import { sub, toCanonical } from '../../money'
import { hasJumpDrive, withJumpDrive } from '../../vehicle/vehicleJumpDrive'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { atBayRejection } from '../dockRules'
import { isFeatureForSale } from '../featureSales'
import { moneyShortRejection } from '../platformServices'

/** The locked-schedule row the jump drive is anchored on (docs/scaling/horizontal/stats.json). */
export const JUMP_DRIVE_ROW_ID = 'jump_drive'

export const JUMP_DRIVE_RULES: { readonly buyJumpDrive: CommandRule<'buyJumpDrive'> } = {
  buyJumpDrive: {
    fields: {},
    reject: (state, { playerId }) => buyJumpDriveRefusal(state, playerId),
    apply: (state, { playerId }) => buyJumpDrive(state, playerId),
  },
}

/** Why the jump drive would be refused now; null when it would be fitted. */
export function buyJumpDriveRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'sell'),
    () => driveOwnedRejection(state, playerId),
    () => notForSaleRejection(state),
    () => moneyShortRejection(state.players[playerId].wallet, jumpDrivePrice()),
  ])
}

function driveOwnedRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (!hasJumpDrive(vehicleOf(state, playerId))) return null
  return rejectionOf('jump_drive_owned', 'the vehicle has its jump drive already')
}

function notForSaleRejection(state: AuthorityState): Rejection | null {
  if (isFeatureForSale(state, JUMP_DRIVE_ROW_ID)) return null
  return rejectionOf('not_for_sale', `the ${JUMP_DRIVE_ROW_ID} row ships nothing yet`)
}

function buyJumpDrive(state: AuthorityState, playerId: string): RuleEffect {
  const wallet = state.players[playerId].wallet
  const cost = jumpDrivePrice()
  const fitted = withVehicle(state, playerId, withJumpDrive(vehicleOf(state, playerId)))
  return {
    state: withWallet(fitted, playerId, sub(wallet, cost)),
    events: [
      { type: 'JumpDriveBought', cost: toCanonical(cost) },
      { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, cost)) },
    ],
  }
}
