/**
 * Top centre (#33 section 5): the low-energy warning, a live charge's fuse warning (#109) and the
 * vehicle state with the tow countdown. Each carries text; with flashes off a warning is steady.
 */
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import styles from './Hud.module.css'

export function HudBanner({ model, isFlashing }: { model: HudModel; isFlashing: boolean }) {
  const { warning, chargeFuse, vehicleState } = model
  const hasCountdown = vehicleState.rescueCountdownTicks !== null
  return (
    <div className={styles.banner}>
      {warning.level !== 'ok' && (
        <strong
          className={styles.warning}
          data-testid={UI_IDS.hudWarningEnergy}
          data-level={warning.level}
          data-icon={warning.icon}
          data-flashing={isFlashing || undefined}
        >
          {warning.text}
        </strong>
      )}
      {chargeFuse !== null && (
        <strong
          className={styles.warning}
          data-testid={UI_IDS.hudChargeFuse}
          data-level={chargeFuse.isInsideBlast ? 'critical' : 'low'}
          data-ticks={chargeFuse.ticksLeft}
          data-flashing={isFlashing || undefined}
        >
          {chargeFuse.text}
        </strong>
      )}
      <span
        data-testid={UI_IDS.hudState}
        data-state={vehicleState.mode}
        data-icon={vehicleState.icon}
      >
        {vehicleState.text}
      </span>
      {hasCountdown && (
        <span
          data-testid={UI_IDS.hudRescueCountdown}
          data-ticks={vehicleState.rescueCountdownTicks}
        >
          {vehicleState.rescueCountdownText}
        </span>
      )}
    </div>
  )
}
