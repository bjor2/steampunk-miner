/**
 * The Upgrade bay's buy rows in the track grid (#33 section 6, #37): the six tracks, then Casing
 * (#41, #58), Lining (#113) and Guns (#107). Each draws as the kernel item card's compact shop row
 * once a describer answers, and as the row below until then (K7 #199). Markup only.
 */
import type { StatPreview, WorkshopRow } from '../../systems/views/workshopRows'
import type { GunRow } from '../../systems/views/gunRow'
import type { LiningRow } from '../../systems/views/liningRow'
import type { CasingRow } from '../../systems/views/upgradeBayModel'
import { ItemCard } from '../kit/ItemCard'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import rowStyles from './TracksPanel.module.css'

export function UpgradeRow({ row, focusedId }: { row: WorkshopRow; focusedId: string }) {
  const id = row.upgradeId
  return (
    <ItemCard variant="compact" card={row.card} buy={row.buy} focusedId={focusedId}>
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
          <Preview
            id={UI_ID_TEMPLATES.workshopUpgradeEffectBefore(id)}
            preview={row.effectBefore}
          />
          <span aria-hidden> → </span>
          <Preview id={UI_ID_TEMPLATES.workshopUpgradeEffectAfter(id)} preview={row.effectAfter} />
          {row.fullSpeedBand !== null && <span> full speed to band {row.fullSpeedBand}</span>}
        </span>
        <ScreenButtonView button={row.buy} focusedId={focusedId} state={row.buyState} />
      </div>
    </ItemCard>
  )
}

export function CasingRowView({ casing, focusedId }: { casing: CasingRow; focusedId: string }) {
  return (
    <ItemCard variant="compact" card={casing.card} buy={casing.buy} focusedId={focusedId}>
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
    </ItemCard>
  )
}

export function LiningRowView({ lining, focusedId }: { lining: LiningRow; focusedId: string }) {
  return (
    <ItemCard variant="compact" card={lining.card} buy={lining.button} focusedId={focusedId}>
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
    </ItemCard>
  )
}

export function GunRowView({ guns, focusedId }: { guns: GunRow; focusedId: string }) {
  return (
    <ItemCard variant="compact" card={guns.card} buy={guns.buy} focusedId={focusedId}>
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
    </ItemCard>
  )
}

function Preview({ id, preview }: { id: string; preview: StatPreview }) {
  return (
    <span data-testid={id} data-exact={preview.exactText}>
      {preview.text}
    </span>
  )
}
