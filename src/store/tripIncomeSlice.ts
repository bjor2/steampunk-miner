/**
 * The game store's trip income slice (spec #678, Systems 2; ticket 719): the local player's last
 * trips' wallet gains (`tripIncome.ts`), which the shop's "{N} trips away" and the next-upgrade
 * chip read. Folded from every batch the store follows; presentation only, never a command, a log
 * line or part of the digest, and a save keeps none of it (like the sale receipt's last trip).
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import {
  EMPTY_TRIP_LEDGER,
  tripLedgerAfterBatch,
  type TripLedger,
} from '../systems/views/tripIncome'

export interface TripIncomeValues {
  tripLedger: TripLedger
}

export interface TripIncomeActions {
  /** Ends a trip on the next unit into the hold and adds each sale to the trip under way. */
  followTripIncome(events: readonly DomainEvent[]): void
}

type SetSlice = (partial: Partial<TripIncomeValues>) => void

export const STARTING_TRIP_INCOME: TripIncomeValues = { tripLedger: EMPTY_TRIP_LEDGER }

export function tripIncomeActionsOf(
  set: SetSlice,
  get: () => TripIncomeValues & { playerId: string },
): TripIncomeActions {
  return {
    followTripIncome: (events) => {
      const { tripLedger, playerId } = get()
      const next = tripLedgerAfterBatch(tripLedger, events, playerId)
      if (next !== tripLedger) set({ tripLedger: next })
    },
  }
}
