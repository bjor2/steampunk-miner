/**
 * The money float-up (spec #678, ticket 684; design section 6): when the money changes, the
 * change rises from the strip's number and fades over `--float-up`, a gain in brass, a spend in
 * copper and signed, so it never rests on colour. Shown on the surface and underground alike;
 * it covers no box and takes no tap.
 */
import { UI_IDS } from '../ids'
import styles from './HudStrip.module.css'
import { useMoneyChange } from './useMoneyChange'

export function MoneyFloatUp({ exact }: { exact: string }) {
  const change = useMoneyChange(exact)
  return (
    <span className={styles.floatLayer} data-testid={UI_IDS.hudMoneyFloat} aria-hidden>
      {change !== null && (
        <span key={change.serial} className={styles.floatUp} data-gain={change.isGain}>
          {change.text}
        </span>
      )}
    </span>
  )
}
