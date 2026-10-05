/**
 * The Upgrade bay's six vehicle tracks (#7 order), each with its icon, level, next cost and
 * "before -> after", then the Casing row, which is not a track (#41, #58), then hull and repair,
 * and the vehicle's visual tier (#33 section 6, #37).
 */
import type { StatPreview, WorkshopRow } from '../../systems/views/workshopRows'
import type { CasingRow, UpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import { Field } from './BayHeader'
import styles from './Platform.module.css'

export function TracksPanel({ model, focusedId }: { model: UpgradeBayModel; focusedId: string }) {
  return (
    <Panel title="Upgrades">
      {model.tracks.map((row) => (
        <UpgradeRow key={row.upgradeId} row={row} focusedId={focusedId} />
      ))}
      <CasingRowView casing={model.casing} focusedId={focusedId} />
      <Field label="Hull">
        <span data-testid={UI_IDS.workshopHull}>{model.repair.hullText}</span>
      </Field>
      <div className={styles.action}>
        <ScreenButtonView button={model.repair.button} focusedId={focusedId} />
        <span data-testid={UI_IDS.workshopRepairCost} data-exact={model.repair.cost.exact}>
          {model.repair.cost.text}
        </span>
      </div>
      <Field label="Look">
        <span data-testid={UI_IDS.workshopVisualTier}>{model.visualTier}</span>
      </Field>
    </Panel>
  )
}

function UpgradeRow({ row, focusedId }: { row: WorkshopRow; focusedId: string }) {
  const id = row.upgradeId
  return (
    <div className={styles.row} data-testid={UI_ID_TEMPLATES.workshopUpgrade(id)}>
      <VectorIcon iconId={row.iconId} />
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

function CasingRowView({ casing, focusedId }: { casing: CasingRow; focusedId: string }) {
  return (
    <div className={styles.row} data-testid={UI_IDS.upgradebayCasing}>
      <VectorIcon iconId={casing.iconId} />
      <span>{casing.label}</span>
      <span data-testid={UI_IDS.upgradebayCasingGrade} data-grade={casing.grade}>
        {casing.gradeText}
      </span>
      <span data-testid={UI_IDS.upgradebayCasingCost} data-exact={casing.cost.exact}>
        {casing.cost.text}
      </span>
      <ScreenButtonView button={casing.buy} focusedId={focusedId} state={casing.buyState} />
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
