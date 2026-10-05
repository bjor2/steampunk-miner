/**
 * The six upgrade tracks with level, next cost and "before -> after", then hull and repair, and
 * the vehicle's visual tier (#7, #33 section 6).
 */
import type { WorkshopPanel as Workshop } from '../../systems/views/platformModel'
import type { StatPreview, WorkshopRow } from '../../systems/views/workshopRows'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { Field } from './PlatformHeader'
import styles from './Platform.module.css'

export function WorkshopPanel({ workshop, focusedId }: { workshop: Workshop; focusedId: string }) {
  return (
    <Panel title="Workshop">
      {workshop.upgrades.map((row) => (
        <UpgradeRow key={row.upgradeId} row={row} focusedId={focusedId} />
      ))}
      <Field label="Hull">
        <span data-testid={UI_IDS.workshopHull}>{workshop.hullText}</span>
      </Field>
      <div className={styles.action}>
        <ScreenButtonView button={workshop.repair} focusedId={focusedId} />
        <span data-testid={UI_IDS.workshopRepairCost} data-exact={workshop.repairCost.exact}>
          {workshop.repairCost.text}
        </span>
      </div>
      <Field label="Look">
        <span data-testid={UI_IDS.workshopVisualTier}>{workshop.visualTier}</span>
      </Field>
    </Panel>
  )
}

function UpgradeRow({ row, focusedId }: { row: WorkshopRow; focusedId: string }) {
  const id = row.upgradeId
  return (
    <div className={styles.row} data-testid={UI_ID_TEMPLATES.workshopUpgrade(id)}>
      <span>{row.label}</span>
      <span data-testid={UI_ID_TEMPLATES.workshopUpgradeLevel(id)}>{row.level}</span>
      <span data-testid={UI_ID_TEMPLATES.workshopUpgradeCost(id)} data-exact={row.cost.exact}>
        {row.cost.text}
      </span>
      <Preview id={UI_ID_TEMPLATES.workshopUpgradeEffectBefore(id)} preview={row.effectBefore} />
      <span aria-hidden>→</span>
      <Preview id={UI_ID_TEMPLATES.workshopUpgradeEffectAfter(id)} preview={row.effectAfter} />
      {row.fullSpeedBand !== null && <span>full speed to band {row.fullSpeedBand}</span>}
      <ScreenButtonView button={row.buy} focusedId={focusedId} state={row.buyState} />
    </div>
  )
}

function Preview({ id, preview }: { id: string; preview: StatPreview }) {
  return (
    <span data-testid={id} data-exact={preview.exactText}>
      {preview.text}
    </span>
  )
}
