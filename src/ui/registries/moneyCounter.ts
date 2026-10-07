/**
 * The bay header's money counter (ticket 220, TD lock on #176): one slice may provide the money it
 * shows, for the sell burst's roll from the old wallet to the new as its coins land. The provider
 * hook gets the authority wallet and returns the Money to show, which the kernel formats once with
 * `amountReading`. With no provider the counter shows the wallet, as before the seam.
 */
import type { Money } from '../../systems/money'
import { defineOneProviderRegistry, entriesOf } from '../../systems/registries/seal'

export interface MoneyCounterProvider {
  id: string
  /** A React hook: called once per header render, never conditionally. */
  useShownMoney(wallet: Money): Money
}

export const MONEY_COUNTER_REGISTRY =
  defineOneProviderRegistry<MoneyCounterProvider>('moneyCounter')

const KERNEL_MONEY_COUNTER: MoneyCounterProvider = {
  id: 'kernel.money-counter',
  useShownMoney: (wallet) => wallet,
}

/** The registered provider, else the kernel's, which shows the wallet. */
export function moneyCounterProvider(): MoneyCounterProvider {
  const [provider] = entriesOf(MONEY_COUNTER_REGISTRY)
  return provider ?? KERNEL_MONEY_COUNTER
}
