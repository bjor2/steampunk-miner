/**
 * Top right (#33 section 5): depth (or ALT) and band, the casing grade badge (#41), the guns' mode
 * and their low-steam badge (#107), the bore gun's auto lamp once the steam sear is researched
 * (ticket 317), the charges carried with the plant key (#109), the dock arrow
 * with its distance, tiles to the core's edge, and the time per tile in front of the drill. Each
 * line's label wears its glyph of the icon set (#158).
 */
import type { ReactNode } from 'react'
import { hudLabelIconIdOf, type HudLabelId } from '../../systems/art/icons/iconSet'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { VectorIcon } from '../VectorIcon'
import { CompassArrow } from './CompassArrow'
import styles from './Hud.module.css'

export function PositionPanel({ model }: { model: HudModel }) {
  const { depth, casing, guns, boreAuto, charges, dockArrow, coreDistance, tileTime } = model
  return (
    <div className={styles.position}>
      <Line label="Depth" icon="depth">
        <span data-testid={UI_IDS.hudDepth}>{depth.text}</span>
      </Line>
      <Line label="Band" icon="depth">
        <span data-testid={UI_IDS.hudBand}>{depth.band ?? '-'}</span>
      </Line>
      {casing !== null && (
        <Line label="Casing" icon="casing">
          <span
            className={styles.casingBadge}
            data-testid={UI_IDS.hudCasing}
            data-state={casing.state}
          >
            {casing.text}
          </span>
        </Line>
      )}
      {guns !== null && (
        <Line label="Guns" icon="guns">
          <span data-testid={UI_IDS.hudGuns} data-mode={guns.mode}>
            {guns.text}
          </span>
        </Line>
      )}
      {guns?.isIdle === true && (
        <span className={styles.gunsIdle} data-testid={UI_IDS.hudGunsIdle}>
          {guns.idleText}
        </span>
      )}
      {boreAuto !== null && (
        <Line label="Bore" icon="guns">
          <span
            className={styles.autoLamp}
            data-testid={UI_IDS.hudBoreAuto}
            data-lamp={boreAuto.colour}
            data-hold={boreAuto.hold ?? ''}
          >
            {boreAuto.text}
          </span>
        </Line>
      )}
      {charges !== null && (
        <Line label="Charges" icon="charges">
          <span data-testid={UI_IDS.hudCharges} data-carried={charges.carried}>
            {charges.text}
          </span>
        </Line>
      )}
      {dockArrow !== null && (
        <Line label="Dock" icon="compass">
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
        <Line label="Core" icon="core">
          <span data-testid={UI_IDS.hudCoreDistance}>{coreDistance}</span>
        </Line>
      )}
      <Line label="Tile" icon="tile_time">
        <span data-testid={UI_IDS.hudTileTime} data-state={tileTime.state}>
          {tileTime.text}
        </span>
      </Line>
    </div>
  )
}

function Line({ label, icon, children }: { label: string; icon: HudLabelId; children: ReactNode }) {
  return (
    <div className={styles.line}>
      <span className={styles.lineLabel}>
        <VectorIcon iconId={hudLabelIconIdOf(icon)} size="hud" />
        {label}
      </span>
      {children}
    </div>
  )
}
