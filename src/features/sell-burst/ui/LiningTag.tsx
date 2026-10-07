/**
 * The `Lining −X` bill tag just left of the bay's money counter (G&V on #176): it shows only when a
 * sale paid a lining bill, reads the summed X of the burst's sales, formatted once, and fades out
 * after its hold. Iron grey, not brass: the bill is not money the player can spend.
 */
import { amountReading } from '../../../systems/views/viewParts'
import { useSellBurstStore } from '../store/sellBurstStore'
import { liningBilledOf } from '../systems/liningTag'
import { trackLiningTag } from './liningTagAnchor'
import styles from './LiningTag.module.css'

export const LINING_TAG_TEST_ID = 'sell-burst-lining-tag'

export function LiningTag() {
  const phase = useSellBurstStore((state) => state.tagPhase)
  const burst = useSellBurstStore((state) => state.burst)
  if (phase === 'hidden' || burst === null) return null
  const billed = amountReading(liningBilledOf(burst))
  return (
    <span
      ref={trackLiningTag}
      className={phase === 'fading' ? styles.fading : styles.tag}
      data-testid={LINING_TAG_TEST_ID}
      data-exact={billed.exact}
    >
      Lining −{billed.text}
    </span>
  )
}
