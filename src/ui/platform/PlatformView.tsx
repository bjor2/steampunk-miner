/**
 * The one-page platform screen drawn from its view model (#33 section 6): header, then shop,
 * workshop and charging side by side, then the footer. Markup only.
 */
import type { PlatformModel } from '../../systems/views/platformModel'
import { UI_IDS } from '../ids'
import { ChargingPanel } from './ChargingPanel'
import { PlatformFooter } from './PlatformFooter'
import { PlatformHeader } from './PlatformHeader'
import styles from './Platform.module.css'
import { ShopPanel } from './ShopPanel'
import { WorkshopPanel } from './WorkshopPanel'

export function PlatformView({ model, focusedId }: { model: PlatformModel; focusedId: string }) {
  return (
    <div className={styles.screen} data-testid={UI_IDS.platformScreen}>
      <PlatformHeader header={model.header} />
      <div className={styles.panels}>
        <ShopPanel shop={model.shop} focusedId={focusedId} />
        <WorkshopPanel workshop={model.workshop} focusedId={focusedId} />
        <ChargingPanel charging={model.charging} focusedId={focusedId} />
      </div>
      <PlatformFooter footer={model.footer} focusedId={focusedId} />
    </div>
  )
}
