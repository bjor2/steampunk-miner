/**
 * The Sell bay's panels on the shared Title+OneLine element (spec #422, pass #427): the quick
 * action and Recharge as their kernel item cards (Content's mapping on #422), each shop row,
 * refined batch and lining amount as a title with glyph-and-value facts on the #33 ids. A price
 * stays a visible fact; what a bare number means moves from its old label to the panel's tooltip,
 * so no text is lost.
 */
import { gaugeIconIdOf, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { itemCardElementOf, type ItemCardElement } from '../../systems/views/itemCardElement'
import type { LiningPanel } from '../../systems/views/liningPanel'
import type { RefinedLine, RefinedPanel } from '../../systems/views/refinedPanel'
import type { ChargingPanel, QuickServiceReading } from '../../systems/views/sellBayModel'
import type { ShopPanel, ShopRow } from '../../systems/views/shopPanel'
import type { ElementText, UiTextUnderTitle } from '../../systems/views/uiText'
import { UI_IDS } from '../ids'
import type { IconValue } from '../kit/TitleOneLine'
import { moneyFactOf, priceFactOf, titleOnlyTextOf } from './dockFacts'

const UNITS_ICON_ID = gaugeIconIdOf('cargo')

/** The assay glyph on a lifted price (#46), named in full in the row's tooltip. */
const ASSAY_MARK = '◈'

export const SHOP_HEADING: UiTextUnderTitle = {
  id: 'dock.shop',
  oneLine: 'Sell ore by tier, or the whole hold at once.',
  tooltipLines: ['Each row: units held, price per unit, then the row value.'],
}

export const CHARGING_HEADING: UiTextUnderTitle = {
  id: 'dock.charging',
  oneLine: "Fill the boiler at this planet's energy price.",
  tooltipLines: ['Energy held, price per unit, then the cost to fill.'],
}

export const REFINED_HEADING: UiTextUnderTitle = {
  id: 'dock.refined',
  oneLine: 'Ready Refinery batches, paid here only.',
  tooltipLines: ['Each batch: units, then what it pays.'],
}

/** #128: before the visit's first payout nothing is forgiven, the bill carries to the next sale. */
export const LINING_HEADING: UiTextUnderTitle = {
  id: 'dock.lining',
  oneLine: "This visit's lining bill, and what your sales paid.",
  tooltipLines: ['Leaving before a payout carries the bill to the next sale.'],
}

export function quickServiceElementOf(quickService: QuickServiceReading): ItemCardElement {
  return itemCardElementOf('dock.quick-service', quickService.card)
}

export function quickServiceFactsOf(quickService: QuickServiceReading): IconValue[] {
  return [priceFactOf(quickService.total, UI_IDS.platformQuickTotal)]
}

export function shopRowTextOf(row: ShopRow): ElementText {
  const tooltipLines = row.isAssayed ? [`${ASSAY_MARK} Assay Beacon: mid-band price`] : []
  return { id: `dock.shop.t${row.tier}`, title: `Tier ${row.tier} ore`, oneLine: '', tooltipLines }
}

export function shopRowFactsOf(row: ShopRow): IconValue[] {
  const unitPrice = priceFactOf(row.unitValue)
  const shownPrice = row.isAssayed ? `${ASSAY_MARK} ${unitPrice.text}` : unitPrice.text
  return [
    { iconId: row.iconId, text: String(row.amount) },
    { ...unitPrice, text: shownPrice },
    { ...moneyFactOf(row.lineValue), iconId: hudLabelIconIdOf('cargo_value') },
  ]
}

export const SHOP_HOLD_TEXT: ElementText = titleOnlyTextOf('dock.shop.hold', 'Hold')

export function shopHoldFactsOf(shop: ShopPanel): IconValue[] {
  return [
    { iconId: UNITS_ICON_ID, text: shop.cargoTotalText, testId: UI_IDS.shopCargoTotal },
    priceFactOf(shop.sellAllValue, UI_IDS.shopSellAllValue),
  ]
}

export function rechargeElementOf(charging: ChargingPanel): ItemCardElement {
  return itemCardElementOf('dock.recharge', charging.rechargeCard)
}

export function rechargeFactsOf(charging: ChargingPanel): IconValue[] {
  return [
    { iconId: gaugeIconIdOf('energy'), text: charging.energyText, testId: UI_IDS.chargingEnergy },
    priceFactOf(charging.price, UI_IDS.chargingPrice),
    priceFactOf(charging.cost, UI_IDS.chargingCost),
  ]
}

export function refinedLineTextOf(line: RefinedLine): ElementText {
  return titleOnlyTextOf(`dock.refined.slot${line.slot}`, `Tier ${line.tier} batch`)
}

export function refinedLineFactsOf(line: RefinedLine): IconValue[] {
  return [{ iconId: UNITS_ICON_ID, text: String(line.units) }, moneyFactOf(line.value)]
}

export const REFINED_COLLECT_TEXT: ElementText = titleOnlyTextOf(
  'dock.refined.collect',
  'Refined total',
)

export function refinedTotalFactsOf(refined: RefinedPanel): IconValue[] {
  return [moneyFactOf(refined.total, UI_IDS.sellbayRefinedTotal)]
}

/** The bill, what sales paid of it and what leaving forgives, each its own titled amount. */
export function liningAmountsOf(lining: LiningPanel): { text: ElementText; fact: IconValue }[] {
  const iconId = hudLabelIconIdOf('lining_bill')
  return [
    {
      text: titleOnlyTextOf('dock.lining.billed', 'Billed'),
      fact: { ...priceFactOf(lining.billed, UI_IDS.sellbayLiningBilled), iconId },
    },
    {
      text: titleOnlyTextOf('dock.lining.paid', 'Paid from sales'),
      fact: moneyFactOf(lining.paid, UI_IDS.sellbayLiningPaid),
    },
    {
      text: titleOnlyTextOf('dock.lining.forgiven', 'Forgiven on leaving'),
      fact: moneyFactOf(lining.forgiven, UI_IDS.sellbayLiningForgiven),
    },
  ]
}
