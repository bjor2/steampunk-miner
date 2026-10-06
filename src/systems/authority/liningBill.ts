/**
 * The lining bill (decision #76 amendment, Game Director on #115): first-place lining is charged as
 * the ring is laid (`casingLiningCharge.ts`) but nothing leaves the wallet mid-dive. The charges add
 * up on the vehicle and are settled at the Sell bay out of the next sale, before its payout, capped
 * at the sale's value so there is never debt; what the sale cannot cover is forgiven, and the
 * settlement logs `lining_settled {billed, paid, forgiven}`. A sale with no bill logs nothing.
 * After a rescue tow the bill simply waits for the next sale. The bill is each player's own: it is
 * on their vehicle and settles at their own sale.
 */
import { cmp, sub, toCanonical, ZERO_MONEY, type Money } from '../money'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'

/** What a sale worth `saleValue` pays of this player's bill: all of it, or the whole sale. */
export function liningPaidOutOf(state: AuthorityState, playerId: string, saleValue: Money): Money {
  const bill = vehicleOf(state, playerId).liningBill
  return cmp(bill, saleValue) <= 0 ? bill : saleValue
}

/** Settle the bill out of a sale already paid into the wallet; the bill is empty afterwards. */
export function settleLiningBill(
  state: AuthorityState,
  playerId: string,
  saleValue: Money,
): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const billed = vehicle.liningBill
  if (cmp(billed, ZERO_MONEY) === 0) return unchanged(state)
  const paid = liningPaidOutOf(state, playerId, saleValue)
  const cleared = withVehicle(state, playerId, { ...vehicle, liningBill: ZERO_MONEY })
  return {
    state: withWallet(cleared, playerId, sub(wallet, paid)),
    events: [
      {
        type: 'LiningSettled',
        billed: toCanonical(billed),
        paid: toCanonical(paid),
        forgiven: toCanonical(sub(billed, paid)),
      },
    ],
  }
}
