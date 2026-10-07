/**
 * One track's plaque around the showcase (#180 section 1; the GD's rules 1-5): its icon, name and
 * level, the rivet pips toward the next big level, cost and "now → next", the line that tempts,
 * counts or says how a hold stopped, and the held Buy. Hovering, focusing or pressing it selects
 * the track, which lights its part and turns it toward the camera. The kernel row's #33 ids stay
 * on the plaque's level, cost, effects and Buy. Markup only.
 */
import { readAuthorityTick } from '../../../store/gameStore'
import type { WorkshopRow } from '../../../systems/views/workshopRows'
import { UI_ID_TEMPLATES } from '../../../ui/ids'
import { VectorIcon } from '../../../ui/VectorIcon'
import { useWorkshopStore } from '../store/workshopStore'
import { HoldBuyButton } from './HoldBuyButton'
import { PipRowView } from './PipRowView'
import { WORKSHOP_TEST_IDS } from './testIds'
import { usePlaqueLine } from './usePlaqueLine'
import styles from './TrackPlaque.module.css'

export function TrackPlaque({
  row,
  focusedId,
  moneyIconId,
}: {
  row: WorkshopRow
  focusedId: string
  /** The bay header's money glyph, so the price reads as a price. */
  moneyIconId: string
}) {
  const id = row.upgradeId
  const isSelected = useWorkshopStore((now) => now.selected === id)
  const { line, priceFlashKey } = usePlaqueLine(id)
  return (
    <div
      className={styles.plaque}
      data-plaque={id}
      data-selected={isSelected || undefined}
      data-testid={UI_ID_TEMPLATES.workshopUpgrade(id)}
      data-buy-state={row.buyState}
      onPointerEnter={() => useWorkshopStore.getState().selectTrack(id, readAuthorityTick())}
    >
      <div className={styles.title}>
        <VectorIcon iconId={row.iconId} badge={row.badge} hasGlint={row.isBuyOpen} />
        <span className={styles.name}>{row.label}</span>
        <span data-testid={UI_ID_TEMPLATES.workshopUpgradeLevel(id)}>{row.levelText}</span>
      </div>
      <PipRowView step={row.level} testId={WORKSHOP_TEST_IDS.plaquePips(id)} />
      <div className={styles.numbers}>
        <VectorIcon iconId={moneyIconId} size="menu" />
        <span
          key={priceFlashKey}
          className={styles.cost}
          data-testid={UI_ID_TEMPLATES.workshopUpgradeCost(id)}
          data-exact={row.cost.exact}
          data-flash={priceFlashKey !== null || undefined}
        >
          {row.cost.text}
        </span>
        <span className={styles.effect}>
          <span
            data-testid={UI_ID_TEMPLATES.workshopUpgradeEffectBefore(id)}
            data-exact={row.effectBefore.exactText}
          >
            {row.effectBefore.text}
          </span>
          <span aria-hidden> → </span>
          <span
            data-testid={UI_ID_TEMPLATES.workshopUpgradeEffectAfter(id)}
            data-exact={row.effectAfter.exactText}
          >
            {row.effectAfter.text}
          </span>
        </span>
      </div>
      <div className={styles.footer}>
        <span
          className={styles.line}
          data-kind={line.kind}
          data-testid={WORKSHOP_TEST_IDS.plaqueLine(id)}
        >
          {line.text}
        </span>
        <HoldBuyButton button={row.buy} upgradeId={id} focusedId={focusedId} state={row.buyState} />
      </div>
    </div>
  )
}
