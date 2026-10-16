/**
 * Top centre (#33 section 5, #158): the combat status stack, at most three triangle icons in
 * priority order with a "+N" pip for the rest, each pulsing at its urgency (a thicker rim with
 * flashes off); then the low-energy and fuse texts, the vehicle state with its icon and the tow
 * countdown. Each carries text; with flashes off a warning is steady. Every text is one shared
 * Title+OneLine element (spec #422, pass #428): a call-out's words before its colon are the title,
 * the rest its one line, so nothing the model says is cut. A status icon's words sit beside it,
 * unless a call-out below says them already: no status text lives in a hover title (ticket 476).
 * On the compact HUD (#500) the banner is one row: the state's icon and at most three chips of at
 * most two words (`hudCompact.ts`), the rest as "+N"; a tap opens the full banner as its card.
 */
import type {
  CombatStatusReading,
  CombatStatusStack,
  SecondaryStatusReading,
} from '../../systems/views/combatStatuses'
import { calloutTextOf, readoutTextOf, statusLabelTextOf } from '../../systems/views/hudCallouts'
import {
  compactStatusRowOf,
  type CompactChip,
  type CompactStatusRow,
} from '../../systems/views/hudCompact'
import type { HudModel } from '../../systems/views/hudModel'
import type { HudDensity } from '../../systems/views/screenLayout'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import { HudBox } from './HudBox'
import styles from './Hud.module.css'

export function HudBanner({
  model,
  isFlashing,
  density = 'full',
}: {
  model: HudModel
  isFlashing: boolean
  density?: HudDensity
}) {
  return (
    <HudBox id="status" className={styles.banner} density={density}>
      {(titlePlace) =>
        titlePlace === 'card' ? (
          <CompactRow
            row={compactStatusRowOf(model.statuses, model.vehicleState)}
            isFlashing={isFlashing}
          />
        ) : (
          <FullBanner model={model} isFlashing={isFlashing} />
        )
      }
    </HudBox>
  )
}

function FullBanner({ model, isFlashing }: { model: HudModel; isFlashing: boolean }) {
  const { warning, chargeFuse, vehicleState } = model
  const hasCountdown = vehicleState.rescueCountdownTicks !== null
  return (
    <>
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
    </>
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
  const label = statusLabelTextOf(status)
  return (
    <span
      className={styles.status}
      data-testid={UI_ID_TEMPLATES.hudStatus(status.id)}
      data-urgency={status.urgency}
      data-pulsing={isFlashing || undefined}
    >
      <VectorIcon iconId={status.iconId} size="banner" />
      {label !== null && <TitleOneLine text={label} level="span" />}
    </span>
  )
}

function SecondaryIcon({ status }: { status: SecondaryStatusReading }) {
  const label = statusLabelTextOf(status)
  return (
    <span
      className={styles.status}
      data-testid={UI_ID_TEMPLATES.hudStatus(status.id)}
      data-urgency="steady"
    >
      <VectorIcon iconId={status.iconId} size="hud" />
      {label !== null && <TitleOneLine text={label} level="span" />}
    </span>
  )
}

/** The compact row: the state's icon, then each chip, the last one saying how many did not fit. */
function CompactRow({ row, isFlashing }: { row: CompactStatusRow; isFlashing: boolean }) {
  const lastChipId = row.chips.at(-1)?.id
  return (
    <div
      className={styles.statuses}
      data-testid={UI_IDS.hudStatuses}
      data-shown={row.chips.length}
      data-hidden={row.hiddenCount}
    >
      <span
        className={styles.state}
        data-testid={UI_IDS.hudState}
        data-state={row.stateMode}
        data-icon={row.stateIconId}
      >
        <VectorIcon iconId={row.stateIconId} size="hud" />
      </span>
      {row.chips.map((chip) => (
        <Chip
          key={chip.id}
          chip={chip}
          isFlashing={isFlashing}
          moreCount={chip.id === lastChipId ? row.hiddenCount : 0}
        />
      ))}
    </div>
  )
}

/** One chip: its icon and words; the last one carries the "+N" of the statuses that did not fit. */
function Chip({
  chip,
  isFlashing,
  moreCount,
}: {
  chip: CompactChip
  isFlashing: boolean
  moreCount: number
}) {
  return (
    <span
      className={styles.status}
      data-testid={UI_ID_TEMPLATES.hudStatus(chip.id)}
      data-urgency={chip.urgency}
      data-pulsing={isFlashing || undefined}
    >
      <TitleOneLine
        text={readoutTextOf(`hud.chip.${chip.id}`, chip.title)}
        iconId={chip.iconId}
        level="span"
        layout="row"
        glyphSize="hud"
      >
        {moreCount > 0 && <span className={styles.chipMore}>+{moreCount}</span>}
      </TitleOneLine>
    </span>
  )
}
