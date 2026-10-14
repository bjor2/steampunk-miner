/**
 * The item heat gauge on the HUD (#263, `itemHeatReading.ts`): the kit's brass gauge in its own
 * panel in the `gauges` slot, drawn only while the player owns the governor or the condenser.
 */
import type { GaugeReading } from '../../../systems/views/hudModel'
import { Gauge } from '../../../ui/kit/Gauge'
import { useScreenModel } from '../../../ui/useScreenModel'
import { readItemHeatGauge } from '../store/itemHeatReads'
import styles from './ItemHeatGauge.module.css'

export const ITEM_HEAT_GAUGE_TEST_ID = 'aetheric-item-heat-gauge'
export const ITEM_HEAT_TEXT_TEST_ID = 'aetheric-item-heat-text'

export function ItemHeatGauge() {
  const reading = useScreenModel(readItemHeatGauge)
  if (reading === null) return null
  return <ItemHeatGaugeView reading={reading} />
}

/** The shown gauge for one reading; a server render draws it from props alone. */
export function ItemHeatGaugeView({ reading }: { reading: GaugeReading }) {
  return (
    <div className={styles.panel}>
      <Gauge
        label="Item heat"
        reading={reading}
        gaugeId={ITEM_HEAT_GAUGE_TEST_ID}
        textId={ITEM_HEAT_TEXT_TEST_ID}
      />
    </div>
  )
}
