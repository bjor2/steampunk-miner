/**
 * The carried Cache Crates on the HUD (ticket 850; G&V's socket table on #823: "Held crates
 * appear only as the HUD count"): the crate's icon and how many are carried, in the gauges slot,
 * nothing while none is. A readout only: the drop is the Cache Crates list's first card.
 */
import { useScreenModel } from '../../../ui/useScreenModel'
import { VectorIcon } from '../../../ui/VectorIcon'
import { kitItemIconIdOf } from '../systems/kitItemContent'
import { readCrateDrop } from '../store/containerReads'
import { PLANET_KIT_TEST_IDS } from './testIds'
import styles from './CarriedCrates.module.css'

export function CarriedCrates() {
  const drop = useScreenModel(readCrateDrop)
  if (drop === null) return null
  return (
    <div
      className={styles.panel}
      data-testid={PLANET_KIT_TEST_IDS.carriedCrates}
      aria-label={`${drop.name}s carried: ${drop.carried}`}
    >
      <VectorIcon iconId={kitItemIconIdOf(drop.kind)} size="hud" />
      <span className={styles.count}>×{drop.carried}</span>
    </div>
  )
}
