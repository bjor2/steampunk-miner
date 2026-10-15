/**
 * Sell ore by tier or all at once (#8, #33 section 6); tiers read by number and by their generated
 * ore icon (#158), never colour alone. Each row, and the hold with Sell all, is one shared
 * Title+OneLine element (spec #422, pass #427): amounts and prices as glyph plus value.
 */
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import type { ShopPanel as Shop, ShopRow } from '../../systems/views/shopPanel'
import { Panel } from '../kit/Panel'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_ID_TEMPLATES } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './Platform.module.css'
import {
  SHOP_HEADING,
  SHOP_HOLD_TEXT,
  shopHoldFactsOf,
  shopRowFactsOf,
  shopRowTextOf,
} from './sellBayElements'

export function ShopPanel({ shop, focusedId }: { shop: Shop; focusedId: string }) {
  return (
    <Panel title="Shop" iconId={panelIconIdOf('shop')} heading={SHOP_HEADING}>
      {shop.rows.map((row) => (
        <ShopRowView key={row.tier} row={row} focusedId={focusedId} />
      ))}
      <div className={styles.row}>
        <TitleOneLine text={SHOP_HOLD_TEXT} facts={shopHoldFactsOf(shop)} level="span">
          <ScreenButtonView button={shop.sellAll} focusedId={focusedId} />
        </TitleOneLine>
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
      data-assayed={row.isAssayed}
    >
      <TitleOneLine text={shopRowTextOf(row)} facts={shopRowFactsOf(row)} level="span">
        <ScreenButtonView button={row.sell} focusedId={focusedId} />
      </TitleOneLine>
    </div>
  )
}
