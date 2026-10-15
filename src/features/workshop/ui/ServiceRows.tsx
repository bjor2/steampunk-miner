/**
 * The Upgrade bay's rows that are not a track (#41 casing, #113 lining, #107 guns, #109 charges,
 * the tech-unlocked vehicle items of ticket 248, the slices' bay entries of ticket 344), then
 * Repair as one shared Title+OneLine element (#425) with the hull, its price and the look tier, and
 * the quick service, under the showcase. The rows are the kernel's own row views, so their #33 ids
 * and their click buys stay exactly as before. Markup only.
 */
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { ChargeRowsView } from '../../../ui/platform/ChargeRowsView'
import {
  BayEntryRowView,
  CasingRowView,
  GunRowView,
  LiningRowView,
  VehicleItemRowView,
} from '../../../ui/platform/ShopRowViews'
import { ScreenButtonView } from '../../../ui/ScreenButtonView'
import type { UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import { serviceElementOf, serviceFactsOf } from './serviceElement'
import styles from './ShowcaseScreen.module.css'

export function ServiceRows({ model, focusedId }: { model: UpgradeBayModel; focusedId: string }) {
  const service = serviceElementOf(model)
  return (
    <div className={styles.service}>
      <div className={styles.serviceRows}>
        <CasingRowView casing={model.casing} focusedId={focusedId} />
        {model.lining !== null && <LiningRowView lining={model.lining} focusedId={focusedId} />}
        {model.guns !== null && <GunRowView guns={model.guns} focusedId={focusedId} />}
        {model.charges !== null && <ChargeRowsView rows={model.charges} focusedId={focusedId} />}
        {model.items.map((row) => (
          <VehicleItemRowView key={row.itemId} row={row} focusedId={focusedId} />
        ))}
        {model.entries.map((row) => (
          <BayEntryRowView key={row.entryId} row={row} focusedId={focusedId} />
        ))}
      </div>
      <div className={styles.serviceActions}>
        <TitleOneLine
          text={service.text}
          iconId={model.repair.card.iconId}
          facts={serviceFactsOf(model)}
          lockReason={service.lockReason}
        >
          <span className={styles.serviceButtons}>
            <ScreenButtonView button={model.repair.button} focusedId={focusedId} />
            <ScreenButtonView button={model.quickService} focusedId={focusedId} />
          </span>
        </TitleOneLine>
      </div>
    </div>
  )
}
