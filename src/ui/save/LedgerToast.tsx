/**
 * `Old ledger restored.` (ticket 705): once per profile, after a v1 save is brought up to this
 * build. A toast takes no tap and goes after the #678 toast time; the store decides when it is due.
 */
import { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { DESIGN_TOKENS } from '../../systems/views/designSystem'
import { LEDGER_TOAST_TEXT } from '../../systems/views/ledgerToast'
import { UI_IDS } from '../ids'
import styles from './LedgerToast.module.css'

export function LedgerToast() {
  const isShown = useGameStore((state) => state.isLedgerToastShown)
  const dismissLedgerToast = useGameStore((state) => state.dismissLedgerToast)
  useEffect(() => dismissAfterToastTime(isShown, dismissLedgerToast), [isShown, dismissLedgerToast])
  return isShown ? <LedgerToastView /> : null
}

export function LedgerToastView() {
  return (
    <div className={styles.toast} role="status" data-testid={UI_IDS.ledgerToast}>
      {LEDGER_TOAST_TEXT}
    </div>
  )
}

function dismissAfterToastTime(isShown: boolean, dismiss: () => void): () => void {
  if (!isShown) return () => {}
  const timer = setTimeout(dismiss, DESIGN_TOKENS.motion.toastMaxMs)
  return () => clearTimeout(timer)
}
