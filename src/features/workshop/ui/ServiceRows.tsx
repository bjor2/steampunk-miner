/**
 * The Upgrade bay's rows that are not a track (#41 casing, #113 lining, #107 guns, #109 charges),
 * hull and repair, the look tier and quick service, under the showcase. They are the kernel's own
 * row views, so their #33 ids and their click buys stay exactly as before. Markup only.
 */
import { UI_IDS } from '../../../ui/ids'
import { ItemTooltip } from '../../../ui/kit/ItemTooltip'
import { Field } from '../../../ui/platform/BayHeader'
import { ChargeRowsView } from '../../../ui/platform/ChargeRowsView'
import { CasingRowView, GunRowView, LiningRowView } from '../../../ui/platform/ShopRowViews'
import { ScreenButtonView } from '../../../ui/ScreenButtonView'
import type { UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import styles from './ShowcaseScreen.module.css'

export function ServiceRows({ model, focusedId }: { model: UpgradeBayModel; focusedId: string }) {
  return (
    <div className={styles.service}>
      <div className={styles.serviceRows}>
        <CasingRowView casing={model.casing} focusedId={focusedId} />
        {model.lining !== null && <LiningRowView lining={model.lining} focusedId={focusedId} />}
        {model.guns !== null && <GunRowView guns={model.guns} focusedId={focusedId} />}
        {model.charges !== null && <ChargeRowsView rows={model.charges} focusedId={focusedId} />}
      </div>
      <div className={styles.serviceActions}>
        <Field label="Hull">
          <span data-testid={UI_IDS.workshopHull}>{model.repair.hullText}</span>
        </Field>
        <ItemTooltip card={model.repair.card}>
          <ScreenButtonView button={model.repair.button} focusedId={focusedId} />
        </ItemTooltip>
        <span data-testid={UI_IDS.workshopRepairCost} data-exact={model.repair.cost.exact}>
          {model.repair.cost.text}
        </span>
        <Field label="Look">
          <span data-testid={UI_IDS.workshopVisualTier}>{model.visualTier}</span>
        </Field>
        <ScreenButtonView button={model.quickService} focusedId={focusedId} />
      </div>
    </div>
  )
}
