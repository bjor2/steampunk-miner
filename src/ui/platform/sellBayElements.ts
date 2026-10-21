/**
 * The Sell bay's panels on the shared Title+OneLine element (spec #422, pass #427): the quick
 * action and Recharge as their kernel item cards (Content's mapping on #422), each shop row,
 * refined batch and lining amount as a title with glyph-and-value facts on the #33 ids, and the
 * Hold row that opens the Hold tab of the base sheet, where ore is sold since ticket 688. A price
 * stays a visible fact; what a bare number means moves from its old label to the panel's tooltip,
 * so no text is lost.
 */
import { gaugeIconIdOf, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { itemCardElementOf, type ItemCardElement } from '../../systems/views/itemCardElement'
import type { LiningPanel } from '../../systems/views/liningPanel'
import type { RefinedLine, RefinedPanel } from '../../systems/views/refinedPanel'
import type { ChargingPanel, HoldRow, QuickServiceReading } from '../../systems/views/sellBayModel'
import type { ElementText, UiTextUnderTitle } from '../../systems/views/uiText'
import { UI_IDS } from '../ids'
import type { IconValue } from '../kit/TitleOneLine'
import { moneyFactOf, priceFactOf, titleOnlyTextOf } from './dockFacts'

const UNITS_ICON_ID = gaugeIconIdOf('cargo')

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

export const HOLD_ROW_TEXT: ElementText = {
  id: 'dock.hold',
  title: 'Hold',
  oneLine: 'Sell ore by tier, or the whole hold at once.',
  tooltipLines: ['Units held against capacity, then what the hold pays.'],
}

export function holdRowFactsOf(hold: HoldRow): IconValue[] {
  return [
    { iconId: UNITS_ICON_ID, text: hold.cargoTotalText, testId: UI_IDS.sellbayHoldCargo },
    {
      ...moneyFactOf(hold.value, UI_IDS.sellbayHoldValue),
      iconId: hudLabelIconIdOf('cargo_value'),
    },
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
