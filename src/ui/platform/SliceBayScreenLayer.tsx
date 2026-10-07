/**
 * A slice's screen for the docked bay (`bayScreens`, #180; K-b ticket 227): a transparent,
 * pointer-taking layer that the slice fills, in place of the kernel's bay markup. Markup only.
 */
import type { SliceBayScreen } from '../registries/bayScreens'
import styles from './SliceBayScreenLayer.module.css'

export function SliceBayScreenLayer({ screen }: { screen: SliceBayScreen }) {
  const { Screen } = screen
  return (
    <div className={styles.layer} data-bay={screen.bay} data-slice-screen={screen.id}>
      <Screen />
    </div>
  )
}
