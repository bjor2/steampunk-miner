/**
 * The bore gun on the desktop HUD (ticket 314, the TD lock on #314 section 2): a ground-gun panel
 * in the `gauges` slot with the recovery ring, the fire key's hint and, once the steam sear is
 * researched, the brass lamp a click toggles (as T does, ticket 317). Hidden while the touch
 * controls show, where the fire tile stands instead. It is mounted with the HUD on every device,
 * so it runs the gun's client clock for the key, the tile and the tracer alike.
 */
import type { CSSProperties } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useScreenModel } from '../../../ui/useScreenModel'
import { readGunPanel, type GunPanelModel } from '../store/fireTileReads'
import { toggleAutoShoot } from '../store/lampInput'
import { FireLamp } from './FireLamp'
import styles from './FireGauge.module.css'
import { useFireClock } from './useFireClock'

export const FIRE_GAUGE_TEST_ID = 'ground-gun-fire-gauge'

const LAMP_CLICK = { onClick: toggleAutoShoot }

export function FireGauge() {
  useFireClock()
  const panel = useScreenModel(readGunPanel)
  const isTouch = useGameStore((state) => state.isTouchControlsShown)
  if (panel === null || isTouch) return null
  return <FireGaugeView panel={panel} />
}

/** The shown gauge for one model; a server render draws it from props alone. */
export function FireGaugeView({ panel }: { panel: GunPanelModel }) {
  const ring = { '--recovery': `${panel.recoveryFilledPercent}%` } as CSSProperties
  return (
    <div
      className={styles.gauge}
      data-testid={FIRE_GAUGE_TEST_ID}
      data-recovering={panel.isRecovering || undefined}
    >
      <span className={styles.ring} style={ring}>
        <VectorIcon iconId="bore-gun-mount" size="hud" />
      </span>
      <span className={styles.hint}>{`Fire (${panel.fireKeyText})`}</span>
      {panel.lamp !== null && <FireLamp lamp={panel.lamp} handlers={LAMP_CLICK} />}
    </div>
  )
}
