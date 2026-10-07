/**
 * The threat periscope's arrows at the screen edge (#162 Sensing row, the GD ruling on #203):
 * one per enemy inside its radius, telegraphing or not, placed by its compass octant like the
 * kernel's `ThreatMarkers`, with the family icon, a distance band, and dust for a burrower. Draws
 * nothing while the periscope is not owned. Reads only the sensing store.
 */
import { VectorIcon } from '../../../ui/VectorIcon'
import { useSensingStore } from '../store/sensingStore'
import { SENSING_TEST_IDS } from './testIds'
import styles from './PeriscopeArrows.module.css'

export function PeriscopeArrows() {
  const warnings = useSensingStore((state) => state.passives.periscope)
  if (warnings === null) return null
  return (
    <div className={styles.arrows}>
      {warnings.map((warning) => (
        <span
          key={warning.enemyId}
          className={styles.arrow}
          data-testid={SENSING_TEST_IDS.periscope}
          data-kind={warning.kind}
          data-octant={warning.octant}
          data-band={warning.band}
          data-dust={warning.isDustTrail || undefined}
        >
          <VectorIcon iconId={warning.iconId} size="hud" />
          {warning.band}
        </span>
      ))}
    </div>
  )
}
