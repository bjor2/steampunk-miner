/**
 * The local player's sales in one batch of authority events, as the burst hears them: each
 * `ResourceSold` with the bill its `LiningSettled` paid. The authority pays the bill out of the
 * sale in the same answer, right after the sale (`liningBill.ts`), so the settlement that follows
 * a sale is that sale's. A settlement with no sale before it (a Refinery payout, or the bill
 * forgiven on leaving) starts no burst.
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { fromCanonical, ZERO_MONEY, type Money } from '../../../systems/money'
import type { BurstSale } from './burstWave'

export interface HeardSale {
  tick: number
  sale: BurstSale
}

export function salesOfBatch(
  events: readonly DomainEvent[],
  playerId: string,
  nextStepPrice: Money,
): HeardSale[] {
  return events.flatMap((event, index) =>
    event.type === 'ResourceSold' && event.playerId === playerId
      ? [heardSaleOf(event, liningPaidAfter(events, index), nextStepPrice)]
      : [],
  )
}

function heardSaleOf(
  sold: Extract<DomainEvent, { type: 'ResourceSold' }>,
  liningPaid: Money,
  nextStepPrice: Money,
): HeardSale {
  return {
    tick: sold.tick,
    sale: {
      items: sold.items,
      credits: fromCanonical(sold.value),
      coinsShown: sold.coinsShown,
      liningPaid,
      nextStepPrice,
    },
  }
}

function liningPaidAfter(events: readonly DomainEvent[], saleIndex: number): Money {
  const next = events[saleIndex + 1]
  return next?.type === 'LiningSettled' ? fromCanonical(next.paid) : ZERO_MONEY
}
