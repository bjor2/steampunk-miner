/**
 * The Sell bay's lining bill for this visit (#128, #76 amendment): what the bill was, what the
 * visit's sales and collected batches have paid of it, and what leaving now would forgive, so the
 * deduction reads as the lining it pays for, not a hidden tax. Before the visit's first payout
 * nothing would be forgiven: the bill carries to the next sale. With no bill the panel is not there.
 */
import type { AuthorityState } from '../authority/authorityState'
import { liningBilledThisVisit } from '../authority/liningBill'
import { cmp, ZERO_MONEY, type Money } from '../money'
import type { VehicleState } from '../vehicle/vehicleState'
import { amountReading, type AmountReading } from './viewParts'

export interface LiningPanel {
  billed: AmountReading
  paid: AmountReading
  /** What leaving the bay now forgives. */
  forgiven: AmountReading
}

export function liningPanelOf(state: AuthorityState, playerId: string): LiningPanel | null {
  const vehicle = state.players[playerId].vehicle
  const billed = liningBilledThisVisit(vehicle)
  if (cmp(billed, ZERO_MONEY) === 0) return null
  return {
    billed: amountReading(billed),
    paid: amountReading(vehicle.liningPaidThisVisit ?? ZERO_MONEY),
    forgiven: amountReading(forgivenOnLeaving(vehicle)),
  }
}

function forgivenOnLeaving(vehicle: VehicleState): Money {
  return vehicle.liningPaidThisVisit === null ? ZERO_MONEY : vehicle.liningBill
}
