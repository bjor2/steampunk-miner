/**
 * The lining bill (decision #76 amendment, Game Director on #115 and #128): first-place lining is
 * charged as the ring is laid (`casingLiningCharge.ts`) but nothing leaves the wallet mid-dive. The
 * charges add up on the vehicle and are settled per Sell bay visit, not per sale: each payout there
 * (an ore sale, or collected Refinery batches) pays what it can of the bill before it reaches the
 * wallet, and logs `lining_settled {billed, paid, forgiven: 0}` with the bill it found. What the
 * visit's payouts could not cover carries to its next payout and is forgiven only when the vehicle
 * leaves the bay, logged as `lining_settled {billed, paid: 0, forgiven}`, so selling a cheap tier
 * first forgives nothing the rest of the hold could pay. There is never debt. A visit with no payout
 * forgives nothing: the bill waits for the next sale, as it does through a rescue tow. The bill is
 * each player's own: it is on their vehicle and settles at their own sale.
 */
import { add, cmp, sub, toCanonical, ZERO_MONEY, type Money } from '../money'
import type { VehicleState } from '../vehicle/vehicleState'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'

/** What proceeds worth `proceeds` pay of this player's bill: all of it, or all the proceeds. */
export function liningPaidOutOf(state: AuthorityState, playerId: string, proceeds: Money): Money {
  const bill = vehicleOf(state, playerId).liningBill
  return cmp(bill, proceeds) <= 0 ? bill : proceeds
}

/** Pay the bill out of proceeds already in the wallet; the unpaid rest stays on for the visit. */
export function payLiningBillOutOf(
  state: AuthorityState,
  playerId: string,
  proceeds: Money,
): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  if (isBillEmpty(vehicle)) return unchanged(state)
  const paid = liningPaidOutOf(state, playerId, proceeds)
  const settled = withVehicle(state, playerId, withVisitPayment(vehicle, paid))
  return {
    state: withWallet(settled, playerId, sub(wallet, paid)),
    events: [settledEvent(vehicle.liningBill, paid, ZERO_MONEY)],
  }
}

/** Leaving the bay closes the visit: what its payouts could not cover is forgiven, never owed. */
export function forgiveLiningBillOnLeaving(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.liningPaidThisVisit === null) return unchanged(state)
  const closed = withVehicle(state, playerId, {
    ...vehicle,
    liningBill: ZERO_MONEY,
    liningPaidThisVisit: null,
  })
  return { state: closed, events: forgivenEventsOf(vehicle) }
}

/** The bill a payout found this visit: what it paid so far plus what is still on the vehicle. */
export function liningBilledThisVisit(vehicle: VehicleState): Money {
  return add(vehicle.liningPaidThisVisit ?? ZERO_MONEY, vehicle.liningBill)
}

function isBillEmpty(vehicle: VehicleState): boolean {
  return cmp(vehicle.liningBill, ZERO_MONEY) === 0
}

/** A visit its payouts paid in full forgives nothing and logs nothing on leaving. */
function forgivenEventsOf(vehicle: VehicleState) {
  if (isBillEmpty(vehicle)) return []
  return [settledEvent(vehicle.liningBill, ZERO_MONEY, vehicle.liningBill)]
}

function withVisitPayment(vehicle: VehicleState, paid: Money): VehicleState {
  return {
    ...vehicle,
    liningBill: sub(vehicle.liningBill, paid),
    liningPaidThisVisit: add(vehicle.liningPaidThisVisit ?? ZERO_MONEY, paid),
  }
}

function settledEvent(billed: Money, paid: Money, forgiven: Money) {
  return {
    type: 'LiningSettled' as const,
    billed: toCanonical(billed),
    paid: toCanonical(paid),
    forgiven: toCanonical(forgiven),
  }
}
