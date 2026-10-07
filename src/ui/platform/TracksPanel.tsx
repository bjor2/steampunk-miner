/**
 * The Upgrade bay's six vehicle tracks (#7 order), each with its icon, level, next cost and
 * "before -> after", then the Casing row, which is not a track (#41, #58), then the Lining row once a
 * lining type is offered (#113), then the Guns row once `auto_guns` is offered (#107), then the
 * Charges and Rack rows once `blasting_charges` is (#109), then the researched vehicle items on sale
 * (ticket 248), then hull and repair, and the vehicle's visual tier (#33 section 6, #37).
 */
import type { UpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { ItemTooltip } from '../kit/ItemTooltip'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { ChargeRowsView } from './ChargeRowsView'
import { Field } from './BayHeader'
import {
  CasingRowView,
  GunRowView,
  LiningRowView,
  UpgradeRow,
  VehicleItemRowView,
} from './ShopRowViews'
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
      {model.items.map((row) => (
        <VehicleItemRowView key={row.itemId} row={row} focusedId={focusedId} />
      ))}
      <Field label="Hull">
        <span data-testid={UI_IDS.workshopHull}>{model.repair.hullText}</span>
      </Field>
      <div className={styles.action}>
        <ItemTooltip card={model.repair.card}>
          <ScreenButtonView button={model.repair.button} focusedId={focusedId} />
        </ItemTooltip>
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
