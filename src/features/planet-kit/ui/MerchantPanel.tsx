/**
 * The planet's merchant on the Sell bay (ticket 821, PK2): one panel row on the bay's `bayPanels`
 * slot (#845), shown where a merchant trades. It names the merchant, says which ore it pays extra
 * for, and lists its stock with each price; the list is keyed on item ids and grows with the rows.
 * Generated planets (#824) get their merchant from the rows alone, through the same one row. The
 * buy action joins each line with #850.
 */
import { hudLabelIconIdOf } from '../../../systems/art/icons/iconSet'
import type { UiTextUnderTitle } from '../../../systems/views/uiText'
import { Panel } from '../../../ui/kit/Panel'
import { TitleOneLine, type IconValue } from '../../../ui/kit/TitleOneLine'
import type { BayPanelKind, BayPanelRow } from '../../../ui/registries/bayPanels'
import { useScreenModel } from '../../../ui/useScreenModel'
import { isMerchantTradingHere, type MerchantStockLine } from '../systems/merchantPanel'
import { PLANET_KITS } from '../systems/planetKitRows'
import { readMerchantPanel } from '../store/merchantReads'
import styles from './MerchantPanel.module.css'

export const MERCHANT_PANEL_KIND_ID = 'planet-kit.merchant'
export const MERCHANT_PANEL_ID = 'planet-kit.merchant'

/** The first panel on the Sell bay: the planet's own trader before any later slice's. */
const MERCHANT_PANEL_ORDER = 10

const MONEY_ICON_ID = hudLabelIconIdOf('money')

export const MERCHANT_PANEL_ROW: BayPanelRow = {
  panelId: MERCHANT_PANEL_ID,
  bayId: 'sell',
  order: MERCHANT_PANEL_ORDER,
  kind: MERCHANT_PANEL_KIND_ID,
  visibleWhen: (state) => isMerchantTradingHere(PLANET_KITS, state),
}

export const MERCHANT_PANEL_KIND: BayPanelKind = {
  id: MERCHANT_PANEL_KIND_ID,
  Panel: MerchantPanel,
}

function MerchantPanel({ panelId }: { panelId: string }) {
  const merchant = useScreenModel(readMerchantPanel)
  if (merchant === null) return null
  return (
    <Panel title={merchant.name} heading={headingOf(panelId, merchant.premiumTag)}>
      <div className={styles.stock}>
        {merchant.stock.map((line) => (
          <TitleOneLine
            key={line.itemId}
            text={stockTextOf(panelId, line)}
            facts={priceFactsOf(line)}
            level="span"
          />
        ))}
      </div>
    </Panel>
  )
}

function headingOf(panelId: string, premiumTag: string): UiTextUnderTitle {
  return { id: `${panelId}.heading`, oneLine: premiumTag, tooltipLines: [] }
}

function stockTextOf(panelId: string, line: MerchantStockLine) {
  return {
    id: `${panelId}.stock.${line.itemId}`,
    title: line.name,
    oneLine: line.oneLine,
    tooltipLines: line.tooltipLines,
  }
}

function priceFactsOf(line: MerchantStockLine): IconValue[] {
  return [{ iconId: MONEY_ICON_ID, text: line.priceText, exact: line.exactPrice, holds: 'price' }]
}
