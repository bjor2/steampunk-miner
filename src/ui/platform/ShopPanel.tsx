/**
 * Sell ore by tier or all at once (#8, #33 section 6); tiers read by number and by their generated
 * ore icon (#158), never colour alone.
 */
import { hudLabelIconIdOf, panelIconIdOf } from '../../systems/art/icons/iconSet'
import type { ShopPanel as Shop, ShopRow } from '../../systems/views/shopPanel'
import { Panel } from '../kit/Panel'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import { VectorIcon } from '../VectorIcon'
import { Field } from './BayHeader'
import styles from './Platform.module.css'

export function ShopPanel({ shop, focusedId }: { shop: Shop; focusedId: string }) {
  return (
    <Panel title="Shop" iconId={panelIconIdOf('shop')}>
      {shop.rows.map((row) => (
        <ShopRowView key={row.tier} row={row} focusedId={focusedId} />
      ))}
      <Field label="Hold" iconId={hudLabelIconIdOf('cargo_value')}>
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
      <VectorIcon iconId={row.iconId} size="menu" />
      <span className={styles.tier}>T{row.tier}</span>
      <span>{row.amount} x</span>
      <span data-exact={row.unitValue.exact} data-assayed={row.isAssayed}>
        {row.isAssayed ? <AssayGlyph /> : null}
        {row.unitValue.text}
      </span>
      <span data-exact={row.lineValue.exact}>{row.lineValue.text}</span>
      <ScreenButtonView button={row.sell} focusedId={focusedId} />
    </div>
  )
}

/** `assay_beacon` lifted this row's price (#46): a text mark, as the row's icon is its ore. */
function AssayGlyph() {
  return (
    <span className={styles.assay} title="Assay Beacon: mid-band price">
      ◈{' '}
    </span>
  )
}
