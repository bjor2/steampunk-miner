/**
 * The bay header's money counter while a burst runs (ticket 220's one `moneyCounter` provider):
 * the wallet less the money still in flight, read at the tick the store last moved, so it rolls
 * from the old wallet to the new as the coins land and ends on the authority value. With no burst
 * it shows the wallet.
 */
import type { Money } from '../../../systems/money'
import type { MoneyCounterProvider } from '../../../ui/registries/moneyCounter'
import { useSellBurstStore } from '../store/sellBurstStore'
import { shownMoneyOf } from '../systems/counterRoll'

export const SELL_BURST_MONEY_COUNTER: MoneyCounterProvider = {
  id: 'sell-burst.money-counter',
  useShownMoney: useRolledMoney,
}

function useRolledMoney(wallet: Money): Money {
  const burst = useSellBurstStore((state) => state.burst)
  const shownTick = useSellBurstStore((state) => state.shownTick)
  return shownMoneyOf(wallet, burst, shownTick)
}
