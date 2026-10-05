/**
 * Top right (#33 section 5): depth (or ALT) and band, the dock arrow with its distance, tiles to
 * the core's edge, and the time per tile in front of the drill.
 */
import type { ReactNode } from 'react'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { CompassArrow } from './CompassArrow'
import styles from './Hud.module.css'

export function PositionPanel({ model }: { model: HudModel }) {
  const { depth, dockArrow, coreDistance, tileTime } = model
  return (
    <div className={styles.position}>
      <Line label="Depth">
        <span data-testid={UI_IDS.hudDepth}>{depth.text}</span>
      </Line>
      <Line label="Band">
        <span data-testid={UI_IDS.hudBand}>{depth.band ?? '-'}</span>
      </Line>
      {dockArrow !== null && (
        <Line label="Dock">
          <CompassArrow octant={dockArrow.octant} />
          <span
            data-testid={UI_IDS.hudCompassDock}
            data-octant={dockArrow.octant}
            data-distance={dockArrow.distance}
          >
            {dockArrow.distance}
          </span>
        </Line>
      )}
      {coreDistance !== null && (
        <Line label="Core">
          <span data-testid={UI_IDS.hudCoreDistance}>{coreDistance}</span>
        </Line>
      )}
      <Line label="Tile">
        <span data-testid={UI_IDS.hudTileTime} data-state={tileTime.state}>
          {tileTime.text}
        </span>
      </Line>
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.line}>
      <span className={styles.lineLabel}>{label}</span>
      {children}
    </div>
  )
}
