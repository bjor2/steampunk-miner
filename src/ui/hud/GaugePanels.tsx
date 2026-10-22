/**
 * The slices' `gauges` panels (feature-slices.md 3.14: the rack, the bore gun's gauge and toggle,
 * the item heat). On desktop and tablets they stack from the bottom right over the tool slot bar,
 * each at its own place. On the compact HUD (#500 declutter, ticket 716) they sit in one tray, a
 * box of the HUD's grid under the strip's rows, so none lies over the drill head or the hazard
 * strip while drilling: the tray places them, and closed it shows each as its glyph or its dial,
 * the words hidden, like #500's compact readings. A clean tap on the tray opens it to the panels
 * with their words, the next one closes it (`useHudCard`); a press on a panel's own control stays
 * that control's. UI state only.
 */
import type { HudDensity } from '../../systems/views/screenLayout'
import { hudBoxOf } from './hudBoxes'
import { SlicePanels } from './SlicePanels'
import { useHudCard } from './useHudCard'
import styles from './GaugePanels.module.css'

export function GaugePanels({
  density,
  isOverCluster,
}: {
  density: HudDensity
  /** The tool slot bar stands over the touch cluster, so the stack's floor rises with it. */
  isOverCluster: boolean
}) {
  const { isOpen, handlers } = useHudCard()
  const isTray = density === 'compact'
  const isTrayOpen = isTray && isOpen
  return (
    <div
      className={styles.gaugePanels}
      data-panel-slot="gauges"
      data-over-cluster={isOverCluster || undefined}
      data-open={isTrayOpen || undefined}
      {...(isTray ? { ...hudBoxOf('panels'), ...handlers } : {})}
    >
      <SlicePanels slot="gauges" />
    </div>
  )
}
