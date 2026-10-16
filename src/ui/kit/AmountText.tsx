/**
 * A money readout's text (spec #470 section 3, ticket 476): the compact `formatAmount` text, and,
 * when it hides digits, a tap target that opens the exact amount in a sheet, because a phone has
 * no hover to show it. The tap is the readout's own: the card or row around it does not act. An
 * amount the short text shows whole stays plain text, so the tap goes to the control under it.
 */
import type { MouseEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import { isExactTextShortened } from '../../systems/displayAmount'
import styles from './AmountText.module.css'

export function AmountText({ text, exact }: { text: string; exact?: string }) {
  if (exact === undefined || !isExactTextShortened(exact)) return <>{text}</>
  return (
    <span
      className={styles.amount}
      data-tap-exact
      onClick={(event) => showExactAmount(event, exact)}
    >
      {text}
    </span>
  )
}

function showExactAmount(event: MouseEvent, exact: string): void {
  event.stopPropagation()
  event.preventDefault()
  useGameStore.getState().showExactAmount(exact)
}
