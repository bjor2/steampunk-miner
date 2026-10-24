/**
 * Five sample merchants for the Sell bay's panel slot (ticket 845), shaped like PK2's planet kits
 * (#821: a name, the premium tag and a stock list) so the kernel e2e and the screenshot suite judge
 * the slot at 1 and at 5 merchants on a phone and on desktop. Each merchant is one row of one kind;
 * no player sees them until `steampunkDebug.features.example.showBayPanels(count)`. The Buy buttons
 * buy nothing: nothing here is a command.
 */
import { hudLabelIconIdOf } from '../../../systems/art/icons/iconSet'
import type { UiTextUnderTitle } from '../../../systems/views/uiText'
import { Button } from '../../../ui/kit/Button'
import { Panel } from '../../../ui/kit/Panel'
import { TitleOneLine, type IconValue } from '../../../ui/kit/TitleOneLine'
import type { BayPanelKind, BayPanelRow } from '../../../ui/registries/bayPanels'
import { isSampleMerchantShown } from '../store/bayPanelProbeStore'
import styles from './SampleMerchantPanel.module.css'

export const SAMPLE_MERCHANT_KIND = 'example.sample-merchant'

interface SampleMerchant {
  name: string
  premiumOre: string
  /** Each item's name and its price as drawn. */
  stock: readonly (readonly [string, string])[]
}

const MERCHANTS: readonly SampleMerchant[] = [
  { name: 'Hearthmoor Assay', premiumOre: 'Honey Amber', stock: [['Cache Crate', '12']] },
  { name: 'Scree Yard', premiumOre: 'Moonstone', stock: [['Scree Plough', '1.4k']] },
  {
    name: 'Gasworks',
    premiumOre: 'Green Apatite',
    stock: [
      ['Scree Plough', '1.4k'],
      ['Damp Flask', '310'],
    ],
  },
  {
    name: 'Lapidary',
    premiumOre: 'Rose Quartz',
    stock: [
      ['Scree Plough', '1.4k'],
      ['Shard Tongs', '9.8k'],
    ],
  },
  {
    name: 'Boilerhouse',
    premiumOre: 'Chromite',
    stock: [
      ['Scree Plough', '1.4k'],
      ['Shard Tongs', '9.8k'],
      ['Vent Vane', '61k'],
    ],
  },
]

const MONEY_ICON_ID = hudLabelIconIdOf('money')

/** The sample merchants as panel rows, in order, each shown once a spec asks for its place. */
export const SAMPLE_MERCHANT_ROWS: readonly BayPanelRow[] = MERCHANTS.map((_, at) => ({
  panelId: sampleMerchantPanelIdOf(at + 1),
  bayId: 'sell',
  order: at + 1,
  kind: SAMPLE_MERCHANT_KIND,
  visibleWhen: () => isSampleMerchantShown(at + 1),
}))

export const SAMPLE_MERCHANT_PANEL_KIND: BayPanelKind = {
  id: SAMPLE_MERCHANT_KIND,
  Panel: SampleMerchantPanel,
}

function SampleMerchantPanel({ panelId }: { panelId: string }) {
  const merchant = MERCHANTS[sampleMerchantPlaceOf(panelId) - 1]
  if (merchant === undefined) return null
  return (
    <Panel title={merchant.name} heading={headingOf(panelId, merchant)}>
      <div className={styles.stock}>
        {merchant.stock.map(([item, price], at) => (
          <TitleOneLine
            key={item}
            text={{ id: `${panelId}.stock-${at + 1}`, title: item, oneLine: '', tooltipLines: [] }}
            facts={priceFactsOf(price)}
            level="span"
          >
            <Button label="Buy" onPress={buyNothing} />
          </TitleOneLine>
        ))}
      </div>
    </Panel>
  )
}

function headingOf(panelId: string, merchant: SampleMerchant): UiTextUnderTitle {
  return {
    id: `${panelId}.heading`,
    oneLine: `Pays extra for ${merchant.premiumOre}.`,
    tooltipLines: [],
  }
}

function priceFactsOf(price: string): IconValue[] {
  return [{ iconId: MONEY_ICON_ID, text: price, holds: 'price' }]
}

function sampleMerchantPanelIdOf(place: number): string {
  return `example.merchant-${place}`
}

function sampleMerchantPlaceOf(panelId: string): number {
  return Number(panelId.slice('example.merchant-'.length))
}

/** A sample: the button stands where PK4's buy will, and does nothing. */
function buyNothing(): void {}
