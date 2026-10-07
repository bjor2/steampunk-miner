/**
 * The bay header's money (ticket 220): the authority wallet, or what the one `moneyCounter`
 * provider shows while its roll runs, formatted once here. `data-exact` stays the authority wallet
 * for specs; `data-shown` appears only while the shown money differs from it.
 */
import { fromCanonical } from '../../systems/money'
import { amountReading, type AmountReading } from '../../systems/views/viewParts'
import { UI_IDS } from '../ids'
import { moneyCounterProvider } from '../registries/moneyCounter'
import { trackMoneyCounter } from './moneyCounterAnchor'

export function MoneyCounter({ wallet }: { wallet: AmountReading }) {
  const shown = useShownMoney(wallet)
  const shownExact = shown.exact === wallet.exact ? undefined : shown.exact
  return (
    <span
      ref={trackMoneyCounter}
      data-testid={UI_IDS.platformMoney}
      data-exact={wallet.exact}
      data-shown={shownExact}
    >
      {shown.text}
    </span>
  )
}

function useShownMoney(wallet: AmountReading): AmountReading {
  const shown = moneyCounterProvider().useShownMoney(fromCanonical(wallet.exact))
  return amountReading(shown)
}
