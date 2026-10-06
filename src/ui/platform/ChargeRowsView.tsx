/**
 * The Upgrade bay's Charges and Rack rows (#109 "Supply"), in the track rows' columns: icon, name,
 * carried or rack size, cost, effect and Buy. At the rack's top size there is no cost to show.
 */
import type { ChargeRow, ChargeRows } from '../../systems/views/chargeRows'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import rowStyles from './TracksPanel.module.css'

/** The ids one row's cells carry. */
interface ChargeRowIds {
  row: string
  level: string
  cost: string
  effect: string
}

const RESTOCK_IDS: ChargeRowIds = {
  row: UI_IDS.upgradebayCharges,
  level: UI_IDS.upgradebayChargesCarried,
  cost: UI_IDS.upgradebayChargesCost,
  effect: UI_IDS.upgradebayChargesEffect,
}

const RACK_IDS: ChargeRowIds = {
  row: UI_IDS.upgradebayRack,
  level: UI_IDS.upgradebayRackSize,
  cost: UI_IDS.upgradebayRackCost,
  effect: UI_IDS.upgradebayRackEffect,
}

export function ChargeRowsView({ rows, focusedId }: { rows: ChargeRows; focusedId: string }) {
  return (
    <>
      <ChargeRowView row={rows.restock} ids={RESTOCK_IDS} focusedId={focusedId} />
      <ChargeRowView row={rows.rack} ids={RACK_IDS} focusedId={focusedId} />
    </>
  )
}

function ChargeRowView({
  row,
  ids,
  focusedId,
}: {
  row: ChargeRow
  ids: ChargeRowIds
  focusedId: string
}) {
  return (
    <div className={rowStyles.trackRow} data-testid={ids.row} data-buy-state={row.buyState}>
      <VectorIcon iconId={row.iconId} badge={row.badge} hasGlint={row.isBuyOpen} />
      <span>{row.label}</span>
      <span data-testid={ids.level}>{row.levelText}</span>
      <span className={rowStyles.cost} data-testid={ids.cost} data-exact={row.cost?.exact}>
        {row.cost?.text ?? '-'}
      </span>
      <span className={rowStyles.effect} data-testid={ids.effect}>
        {row.effectText}
      </span>
      <ScreenButtonView button={row.buy} focusedId={focusedId} state={row.buyState} />
    </div>
  )
}
