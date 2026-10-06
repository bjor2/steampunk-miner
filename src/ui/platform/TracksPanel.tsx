/**
 * The Upgrade bay's six vehicle tracks (#7 order), each with its icon, level, next cost and
 * "before -> after", then the Casing row, which is not a track (#41, #58), then the Lining row once a
 * lining type is offered (#113), then the Guns row once `auto_guns` is offered (#107), then the
 * Charges and Rack rows once `blasting_charges` is (#109), then hull and repair, and the vehicle's
 * visual tier (#33 section 6, #37).
 */
import type { StatPreview, WorkshopRow } from '../../systems/views/workshopRows'
import type { GunRow } from '../../systems/views/gunRow'
import type { LiningRow } from '../../systems/views/liningRow'
import type { CasingRow, UpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { ChargeRowsView } from './ChargeRowsView'
import { VectorIcon } from '../VectorIcon'
import { Field } from './BayHeader'
import styles from './Platform.module.css'
import rowStyles from './TracksPanel.module.css'

export function TracksPanel({ model, focusedId }: { model: UpgradeBayModel; focusedId: string }) {
  return (
    <Panel title="Upgrades" iconId={panelIconIdOf('upgrades')}>
      <TrackColumns />
      {model.tracks.map((row) => (
        <UpgradeRow key={row.upgradeId} row={row} focusedId={focusedId} />
      ))}
      <CasingRowView casing={model.casing} focusedId={focusedId} />
      {model.lining !== null && <LiningRowView lining={model.lining} focusedId={focusedId} />}
      {model.guns !== null && <GunRowView guns={model.guns} focusedId={focusedId} />}
      {model.charges !== null && <ChargeRowsView rows={model.charges} focusedId={focusedId} />}
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

/** The column heads, so the bare numbers of a row read as level, cost and effect. */
function TrackColumns() {
  return (
    <div className={rowStyles.trackRow} aria-hidden>
      <span />
      <span className={rowStyles.columnHead}>Track</span>
      <span className={rowStyles.columnHead}>Lv</span>
      <span className={rowStyles.columnHead}>Cost</span>
      <span className={rowStyles.columnHead}>Now → next</span>
      <span />
    </div>
  )
}

function UpgradeRow({ row, focusedId }: { row: WorkshopRow; focusedId: string }) {
  const id = row.upgradeId
  return (
    <div
      className={rowStyles.trackRow}
      data-testid={UI_ID_TEMPLATES.workshopUpgrade(id)}
      data-buy-state={row.buyState}
    >
      <VectorIcon iconId={row.iconId} badge={row.badge} hasGlint={row.isBuyOpen} />
      <span>{row.label}</span>
      <span data-testid={UI_ID_TEMPLATES.workshopUpgradeLevel(id)}>{row.level}</span>
      <span
        className={rowStyles.cost}
        data-testid={UI_ID_TEMPLATES.workshopUpgradeCost(id)}
        data-exact={row.cost.exact}
      >
        {row.cost.text}
      </span>
      <span className={rowStyles.effect}>
        <Preview id={UI_ID_TEMPLATES.workshopUpgradeEffectBefore(id)} preview={row.effectBefore} />
        <span aria-hidden> → </span>
        <Preview id={UI_ID_TEMPLATES.workshopUpgradeEffectAfter(id)} preview={row.effectAfter} />
        {row.fullSpeedBand !== null && <span> full speed to band {row.fullSpeedBand}</span>}
      </span>
      <ScreenButtonView button={row.buy} focusedId={focusedId} state={row.buyState} />
    </div>
  )
}

function CasingRowView({ casing, focusedId }: { casing: CasingRow; focusedId: string }) {
  return (
    <div
      className={rowStyles.trackRow}
      data-testid={UI_IDS.upgradebayCasing}
      data-buy-state={casing.buyState}
    >
      <VectorIcon iconId={casing.iconId} badge={casing.badge} hasGlint={casing.isBuyOpen} />
      <span>{casing.label}</span>
      <span />
      <span
        className={rowStyles.cost}
        data-testid={UI_IDS.upgradebayCasingCost}
        data-exact={casing.cost.exact}
      >
        {casing.cost.text}
      </span>
      <span
        className={rowStyles.effect}
        data-testid={UI_IDS.upgradebayCasingGrade}
        data-grade={casing.grade}
      >
        {casing.gradeText}
      </span>
      <ScreenButtonView button={casing.buy} focusedId={focusedId} state={casing.buyState} />
    </div>
  )
}

function LiningRowView({ lining, focusedId }: { lining: LiningRow; focusedId: string }) {
  return (
    <div
      className={rowStyles.trackRow}
      data-testid={UI_IDS.upgradebayLining}
      data-buy-state={lining.buyState}
    >
      <VectorIcon iconId={lining.iconId} badge={lining.badge} hasGlint={lining.isBuyOpen} />
      <span>{lining.label}</span>
      <span data-testid={UI_IDS.upgradebayLiningActive}>{lining.activeText}</span>
      <span
        className={rowStyles.cost}
        data-testid={UI_IDS.upgradebayLiningCost}
        data-exact={lining.cost.exact}
      >
        {lining.cost.text}
      </span>
      <span className={rowStyles.effect} data-testid={UI_IDS.upgradebayLiningEffect}>
        {lining.effectText}
      </span>
      <ScreenButtonView button={lining.button} focusedId={focusedId} state={lining.buyState} />
    </div>
  )
}

function GunRowView({ guns, focusedId }: { guns: GunRow; focusedId: string }) {
  return (
    <div
      className={rowStyles.trackRow}
      data-testid={UI_IDS.upgradebayGuns}
      data-buy-state={guns.buyState}
    >
      <VectorIcon iconId={guns.iconId} badge={guns.badge} hasGlint={guns.isBuyOpen} />
      <span>{guns.label}</span>
      <span data-testid={UI_IDS.upgradebayGunsLevel} data-level={guns.level}>
        {guns.levelText}
      </span>
      <span
        className={rowStyles.cost}
        data-testid={UI_IDS.upgradebayGunsCost}
        data-exact={guns.cost.exact}
      >
        {guns.cost.text}
      </span>
      <span className={rowStyles.effect} data-testid={UI_IDS.upgradebayGunsEffect}>
        {guns.effectText}
      </span>
      <ScreenButtonView button={guns.buy} focusedId={focusedId} state={guns.buyState} />
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
