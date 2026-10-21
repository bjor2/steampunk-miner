/**
 * The strip's status icons (spec #678; docs/ui/design-system.md section 10): the vehicle state's
 * icon, then at most three combat or secondary statuses in priority order, each its icon and the
 * number its title carries, the last one saying how many more did not fit (#158, #486). Their
 * words sit in the detail behind the gear button; urgency pulses, or with flashes off a thicker
 * rim says the same. The warning layer (#685) builds its status plates on this row.
 */
import { readoutTextOf } from '../../systems/views/hudCallouts'
import {
  compactChipValueOf,
  compactStatusRowOf,
  type CompactChip,
} from '../../systems/views/hudCompact'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import styles from './StripStatuses.module.css'

export function StripStatuses({ model, isFlashing }: { model: HudModel; isFlashing: boolean }) {
  const row = compactStatusRowOf(model.statuses, model.vehicleState)
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
        <VectorIcon iconId={row.stateIconId} size="menu" />
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

/** One chip: its icon and the number its title carries; the last carries the "+N". */
function Chip({
  chip,
  isFlashing,
  moreCount,
}: {
  chip: CompactChip
  isFlashing: boolean
  moreCount: number
}) {
  const value = compactChipValueOf(chip.title)
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
        glyphSize="menu"
        titlePlace="card"
      >
        {value !== '' && <span className={styles.chipValue}>{value}</span>}
        {moreCount > 0 && <span className={styles.chipMore}>+{moreCount}</span>}
      </TitleOneLine>
    </span>
  )
}
