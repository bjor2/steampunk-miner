/**
 * Enemy telegraphs at the screen edge (#33 section 5, #158): one marker per threat, placed by its
 * octant, carrying the enemy family's icon, the arc letter it would hit and a tremor glyph for
 * the burrower.
 */
import type { ThreatMarker } from '../../systems/views/threatMarkers'
import { UI_ID_TEMPLATES } from '../ids'
import { VectorIcon } from '../VectorIcon'
import styles from './Hud.module.css'

export function ThreatMarkers({ threats }: { threats: readonly ThreatMarker[] }) {
  return (
    <div className={styles.threats}>
      {threats.map((threat, index) => (
        <span
          key={index}
          className={styles.threat}
          data-testid={UI_ID_TEMPLATES.hudThreat(index)}
          data-kind={threat.kind}
          data-octant={threat.octant}
          data-arc={threat.arc}
          data-ticks-left={threat.ticksLeft}
          data-tremor={threat.isTremor || undefined}
        >
          <VectorIcon iconId={threat.iconId} size="hud" />
          {threat.arc}
        </span>
      ))}
    </div>
  )
}
