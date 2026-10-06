/**
 * The Sell bay screen (#37): "Sell, repair and recharge" with its exact total (highlighted on the
 * first visit, #16), the shop, the refined batches once the platform has the Refinery bay (#105),
 * the visit's lining bill while there is one (#128) and the charging station. Markup only.
 */
import type { QuickServiceReading, SellBayModel } from '../../systems/views/sellBayModel'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { BayFrame } from './BayFrame'
import { ChargingPanel } from './ChargingPanel'
import { LiningPanel } from './LiningPanel'
import styles from './Platform.module.css'
import { RefinedPanel } from './RefinedPanel'
import { ShopPanel } from './ShopPanel'

export function SellBayView({ model, focusedId }: { model: SellBayModel; focusedId: string }) {
  return (
    <BayFrame header={model.header} footer={model.footer} focusedId={focusedId}>
      <div className={styles.sellPanels} data-testid={UI_IDS.sellbayScreen}>
        <QuickServiceAction quickService={model.quickService} focusedId={focusedId} />
        <ShopPanel shop={model.shop} focusedId={focusedId} />
        {model.refined === null ? null : (
          <RefinedPanel refined={model.refined} focusedId={focusedId} />
        )}
        {model.lining === null ? null : <LiningPanel lining={model.lining} />}
        <ChargingPanel charging={model.charging} focusedId={focusedId} />
      </div>
    </BayFrame>
  )
}

function QuickServiceAction({
  quickService,
  focusedId,
}: {
  quickService: QuickServiceReading
  focusedId: string
}) {
  return (
    <span className={styles.action}>
      <ScreenButtonView
        button={quickService.button}
        focusedId={focusedId}
        state={quickService.isHighlighted ? 'highlighted' : undefined}
      />
      <span data-testid={UI_IDS.platformQuickTotal} data-exact={quickService.total.exact}>
        {quickService.total.text}
      </span>
    </span>
  )
}
