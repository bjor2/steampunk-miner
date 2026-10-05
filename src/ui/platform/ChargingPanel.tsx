/** Energy, the price per unit and the cost of filling the tank (#8, #33 section 6). */
import type { ChargingPanel as Charging } from '../../systems/views/platformModel'
import { Panel } from '../kit/Panel'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { Field } from './PlatformHeader'
import styles from './Platform.module.css'

export function ChargingPanel({ charging, focusedId }: { charging: Charging; focusedId: string }) {
  return (
    <Panel title="Charging">
      <Field label="Energy">
        <span data-testid={UI_IDS.chargingEnergy}>{charging.energyText}</span>
      </Field>
      <Field label="Per unit">
        <span data-testid={UI_IDS.chargingPrice} data-exact={charging.price.exact}>
          {charging.price.text}
        </span>
      </Field>
      <div className={styles.action}>
        <ScreenButtonView button={charging.recharge} focusedId={focusedId} />
        <span data-testid={UI_IDS.chargingCost} data-exact={charging.cost.exact}>
          {charging.cost.text}
        </span>
      </div>
    </Panel>
  )
}
