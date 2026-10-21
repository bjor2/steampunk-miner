/**
 * The warning layer's edge glow (spec #678, ticket 685; docs/ui/design-system.md sections 7 and
 * 10): an inset glow along all four screen edges in the colour of the deepest ladder tier a
 * reading stands in, pulsing at `--glow-pulse` while it holds, steady with flashes off or under
 * Reduce Motion. It carries no box and no text, so it never covers the shaft or counts against
 * the HUD's coverage; the readout it warns of pulses its icon on the strip, and its words stay in
 * the detail behind the gear button. Markup only.
 */
import type { EdgeGlow } from '../../systems/views/warningWatch'
import { UI_IDS } from '../ids'
import styles from './WarningGlow.module.css'

export function WarningGlow({ glow, isFlashing }: { glow: EdgeGlow; isFlashing: boolean }) {
  return (
    <div
      className={styles.glow}
      data-testid={UI_IDS.hudEdgeGlow}
      data-tier={glow.tier}
      data-readout={glow.readoutId ?? undefined}
      data-pulsing={isFlashing || undefined}
      aria-hidden="true"
    />
  )
}
