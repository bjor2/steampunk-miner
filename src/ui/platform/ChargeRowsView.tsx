/**
 * The Upgrade bay's Charges rows, one per charge size open (K8 #218), and its Rack row (#109
 * "Supply"), in the track rows' columns: icon, name, carried or rack size, cost, effect and Buy. At
 * the rack's top size there is no cost to show. Each draws as the kernel item card's compact shop
 * row once a describer answers (K7 #199).
 */
import type { ChargeRow, ChargeRows } from '../../systems/views/chargeRows'
import { ItemCard } from '../kit/ItemCard'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import rowStyles from './TracksPanel.module.css'

export function ChargeRowsView({ rows, focusedId }: { rows: ChargeRows; focusedId: string }) {
  return (
    <>
      {rows.restock.map((row) => (
        <ChargeRowView key={row.ids.row} row={row} focusedId={focusedId} />
      ))}
      <ChargeRowView row={rows.rack} focusedId={focusedId} />
    </>
  )
}

function ChargeRowView({ row, focusedId }: { row: ChargeRow; focusedId: string }) {
  const { ids } = row
  return (
    <ItemCard variant="compact" card={row.card} buy={row.buy} focusedId={focusedId}>
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
    </ItemCard>
  )
}
