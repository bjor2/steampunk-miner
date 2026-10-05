/** Sell ore by tier or all at once (#8, #33 section 6); tiers read by number, never colour. */
import type { ShopPanel as Shop, ShopRow } from '../../systems/views/shopPanel'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { Field } from './PlatformHeader'
import styles from './Platform.module.css'

export function ShopPanel({ shop, focusedId }: { shop: Shop; focusedId: string }) {
  return (
    <Panel title="Shop">
      {shop.rows.map((row) => (
        <ShopRowView key={row.tier} row={row} focusedId={focusedId} />
      ))}
      <Field label="Hold">
        <span data-testid={UI_IDS.shopCargoTotal}>{shop.cargoTotalText}</span>
      </Field>
      <div className={styles.action}>
        <ScreenButtonView button={shop.sellAll} focusedId={focusedId} />
        <span data-testid={UI_IDS.shopSellAllValue} data-exact={shop.sellAllValue.exact}>
          {shop.sellAllValue.text}
        </span>
      </div>
    </Panel>
  )
}

function ShopRowView({ row, focusedId }: { row: ShopRow; focusedId: string }) {
  return (
    <div
      className={styles.row}
      data-testid={UI_ID_TEMPLATES.shopRow(row.tier)}
      data-tier={row.tier}
      data-family={row.family}
    >
      <span className={styles.tier}>T{row.tier}</span>
      <span>{row.amount} x</span>
      <span data-exact={row.unitValue.exact}>{row.unitValue.text}</span>
      <span data-exact={row.lineValue.exact}>{row.lineValue.text}</span>
      <ScreenButtonView button={row.sell} focusedId={focusedId} />
    </div>
  )
}
