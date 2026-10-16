/**
 * The exact amount behind a tapped money readout (spec #470 section 3, ticket 476): a sheet along
 * the bottom of the screen with the canonical `exactAmount` text, over every layer but the
 * unsupported-device card. Any tap on it, or on the dimmed screen around it, closes it.
 */
import { useGameStore } from '../../store/gameStore'
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { formatAmount } from '../../systems/displayAmount'
import { fromCanonical } from '../../systems/money'
import type { ElementText } from '../../systems/views/uiText'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import styles from './ExactAmountSheet.module.css'
import { EXACT_AMOUNT_IDS } from './exactAmountIds'

const SHEET_TEXT: ElementText = {
  id: 'exact-amount',
  title: 'Exact amount',
  oneLine: '',
  tooltipLines: [],
}

export function ExactAmountSheet() {
  const exact = useGameStore((state) => state.shownExactAmount)
  return exact === null ? null : <ExactAmountSheetView exact={exact} />
}

export function ExactAmountSheetView({ exact }: { exact: string }) {
  const closeSheet = useGameStore((state) => state.closeExactAmount)
  return (
    <div className={styles.layer} data-testid={EXACT_AMOUNT_IDS.sheet} onClick={closeSheet}>
      <section className={styles.sheet}>
        <TitleOneLine text={SHEET_TEXT} facts={exactFactsOf(exact)} level="span" />
      </section>
    </div>
  )
}

/** The short text the readout showed, then the whole canonical amount. */
function exactFactsOf(exact: string): IconValue[] {
  const iconId = hudLabelIconIdOf('money')
  return [
    { iconId, text: formatAmount(fromCanonical(exact)) },
    { iconId, text: exact, testId: EXACT_AMOUNT_IDS.text },
  ]
}
