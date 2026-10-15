/**
 * Top centre (#33 section 5, #158): the combat status stack, at most three triangle icons in
 * priority order with a "+N" pip for the rest, each pulsing at its urgency (a thicker rim with
 * flashes off); then the low-energy and fuse texts, the vehicle state with its icon and the tow
 * countdown. Each carries text; with flashes off a warning is steady. Every text is one shared
 * Title+OneLine element (spec #422, pass #428): a call-out's words before its colon are the title,
 * the rest its one line, so nothing the model says is cut.
 */
import type {
  CombatStatusReading,
  CombatStatusStack,
  SecondaryStatusReading,
} from '../../systems/views/combatStatuses'
import { calloutTextOf, readoutTextOf } from '../../systems/views/hudCallouts'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import styles from './Hud.module.css'

export function HudBanner({ model, isFlashing }: { model: HudModel; isFlashing: boolean }) {
  const { warning, chargeFuse, vehicleState } = model
  const hasCountdown = vehicleState.rescueCountdownTicks !== null
  return (
    <div className={styles.banner}>
      <StatusStack stack={model.statuses} isFlashing={isFlashing} />
      {warning.level !== 'ok' && (
        <div
          className={styles.warning}
          data-testid={UI_IDS.hudWarningEnergy}
          data-level={warning.level}
          data-icon={warning.icon}
          data-flashing={isFlashing || undefined}
        >
          <TitleOneLine text={calloutTextOf('hud.energy-warning', warning.text)} level="span" />
        </div>
      )}
      {chargeFuse !== null && (
        <div
          className={styles.warning}
          data-testid={UI_IDS.hudChargeFuse}
          data-level={chargeFuse.isInsideBlast ? 'critical' : 'low'}
          data-ticks={chargeFuse.ticksLeft}
          data-flashing={isFlashing || undefined}
        >
          <TitleOneLine text={calloutTextOf('hud.charge-fuse', chargeFuse.text)} level="span" />
        </div>
      )}
      <div
        className={styles.state}
        data-testid={UI_IDS.hudState}
        data-state={vehicleState.mode}
        data-icon={vehicleState.icon}
      >
        <TitleOneLine
          text={readoutTextOf('hud.state', vehicleState.text)}
          iconId={vehicleState.icon}
          level="span"
          glyphSize="hud"
        />
      </div>
      {hasCountdown && (
        <div data-testid={UI_IDS.hudRescueCountdown} data-ticks={vehicleState.rescueCountdownTicks}>
          <TitleOneLine
            text={calloutTextOf('hud.rescue-countdown', vehicleState.rescueCountdownText)}
            level="span"
          />
        </div>
      )}
    </div>
  )
}

function StatusStack({ stack, isFlashing }: { stack: CombatStatusStack; isFlashing: boolean }) {
  return (
    <div
      className={styles.statuses}
      data-testid={UI_IDS.hudStatuses}
      data-shown={stack.shown.length}
      data-hidden={stack.hiddenCount}
    >
      {stack.shown.map((status) => (
        <StatusIcon key={status.id} status={status} isFlashing={isFlashing} />
      ))}
      {stack.hiddenCount > 0 && (
        <div className={styles.statusMore}>
          <TitleOneLine
            text={readoutTextOf('hud.statuses-more', `+${stack.hiddenCount} more`)}
            level="span"
          />
        </div>
      )}
      {stack.secondary.map((status) => (
        <SecondaryIcon key={status.id} status={status} />
      ))}
    </div>
  )
}

function StatusIcon({ status, isFlashing }: { status: CombatStatusReading; isFlashing: boolean }) {
  return (
    <span
      className={styles.status}
      title={status.text}
      data-testid={UI_ID_TEMPLATES.hudStatus(status.id)}
      data-urgency={status.urgency}
      data-pulsing={isFlashing || undefined}
    >
      <VectorIcon iconId={status.iconId} size="banner" />
    </span>
  )
}

function SecondaryIcon({ status }: { status: SecondaryStatusReading }) {
  return (
    <span
      className={styles.status}
      title={status.text}
      data-testid={UI_ID_TEMPLATES.hudStatus(status.id)}
      data-urgency="steady"
    >
      <VectorIcon iconId={status.iconId} size="hud" />
    </span>
  )
}
