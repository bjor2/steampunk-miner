/**
 * Energy, the price per unit and the cost of filling the tank (#8, #33 section 6); Recharge carries
 * the service's item card as a tooltip once a describer answers (K7 #199).
 */
import type { ChargingPanel as Charging } from '../../systems/views/sellBayModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { ItemTooltip } from '../kit/ItemTooltip'
import { Panel } from '../kit/Panel'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { Field } from './BayHeader'
import styles from './Platform.module.css'

export function ChargingPanel({ charging, focusedId }: { charging: Charging; focusedId: string }) {
  return (
    <Panel title="Charging" iconId={panelIconIdOf('charging')}>
      <Field label="Energy">
        <span data-testid={UI_IDS.chargingEnergy}>{charging.energyText}</span>
      </Field>
      <Field label="Per unit">
        <span data-testid={UI_IDS.chargingPrice} data-exact={charging.price.exact}>
          {charging.price.text}
        </span>
      </Field>
      <div className={styles.action}>
        <ItemTooltip card={charging.rechargeCard}>
          <ScreenButtonView button={charging.recharge} focusedId={focusedId} />
        </ItemTooltip>
        <span data-testid={UI_IDS.chargingCost} data-exact={charging.cost.exact}>
          {charging.cost.text}
        </span>
      </div>
    </Panel>
  )
}
