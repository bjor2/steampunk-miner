/**
 * `selectSellBayModel` (#37 Sell bay screen): the Hold row, the hold's units and sale value with
 * the button that opens the Hold tab of the base sheet, where #33's sale by tier and Sell all now
 * live (ticket 688), the player's ready Refinery batches with Collect (#105), the
 * visit's lining bill with what it paid and what leaving forgives (#128), Recharge with its cost,
 * and "Sell, repair and recharge" with its exact total (refined batches included) as the focused
 * default, under the shared header and footer. A pure function of the authority replica and the
 * screen's UI state.
 */
import { buttonIconIdOf } from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { rechargeCostOf, serviceQuote, type ServiceQuote } from '../authority/platformServices'
import { energyUnitPrice } from '../economy/planetCharges'
import { add, toCanonical } from '../money'
import { quickServiceCommand, rechargeEnergyCommand } from '../platform/platformCommands'
import { energyGaugeText } from '../vehicle/vehicleReadout'
import { energyMaxQuantaOf } from '../vehicle/vehicleState'
import {
  bayFooterOf,
  bayHeaderOf,
  footerButtonsOf,
  stopIn,
  type BayFooter,
  type BayHeader,
  type BayUiState,
} from './bayFrame'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import { serviceCardOf, type ItemCardModel } from './itemCardModel'
import type { FocusStop } from './menuFocus'
import { UI_IDS } from './screenIds'
import { holdTotalsOf } from './holdSheet'
import { KERNEL_SHEET_TAB_IDS } from './kernelSheetTabIds'
import { liningPanelOf, type LiningPanel } from './liningPanel'
import { refinedPanelOf, type RefinedPanel } from './refinedPanel'
import {
  amountReading,
  priceReading,
  commandButton,
  statReading,
  uiButton,
  withIcon,
  type AmountReading,
  type ScreenButton,
} from './viewParts'

export interface ChargingPanel {
  energyText: string
  /** Per unit; on planet 2 it has more decimals than a charge, so the text is cut to 3. */
  price: AmountReading
  cost: AmountReading
  recharge: ScreenButton
  /** The service's card, a tooltip over Recharge (K7 #199). */
  rechargeCard: ItemCardModel
}

export interface QuickServiceReading {
  button: ScreenButton
  isHighlighted: boolean
  total: AmountReading
  /** The service's card, a tooltip over the quick action (K7 #199). */
  card: ItemCardModel
}

/** The hold at a glance, and the button that opens the Hold tab to sell it (ticket 688). */
export interface HoldRow {
  cargoTotalText: string
  value: AmountReading
  open: ScreenButton
}

export interface SellBayModel {
  header: BayHeader
  hold: HoldRow
  /** Null before the platform has the Refinery bay (#105). */
  refined: RefinedPanel | null
  /** Null while the vehicle has no lining bill (#128). */
  lining: LiningPanel | null
  charging: ChargingPanel
  quickService: QuickServiceReading
  footer: BayFooter
  /** Every button in reading order with its panel, for keyboard focus. */
  focusStops: FocusStop[]
  /** Every button on the screen, for presses by id. */
  buttons: ScreenButton[]
}

/** Docking at the Sell bay focuses the quick action (#33, #37). */
export const SELL_BAY_START_FOCUS: string = UI_IDS.platformQuickService

export function selectSellBayModel(
  state: AuthorityState,
  playerId: string,
  ui: BayUiState,
): SellBayModel {
  const hold = holdRowOf(state, playerId)
  const refined = refinedPanelOf(state, playerId)
  const charging = chargingPanelOf(state, playerId)
  const quickService = quickServiceOf(state, playerId, ui)
  const footer = bayFooterOf(state, playerId, ui)
  return {
    header: bayHeaderOf(state, playerId, 'sell'),
    hold,
    refined,
    lining: liningPanelOf(state, playerId),
    charging,
    quickService,
    footer,
    focusStops: sellBayFocusStops(hold, refined, charging, quickService, footer),
    buttons: [
      hold.open,
      ...refinedButtonsOf(refined),
      charging.recharge,
      quickService.button,
      ...footerButtonsOf(footer),
    ],
  }
}

function holdRowOf(state: AuthorityState, playerId: string): HoldRow {
  const open = uiButton(UI_IDS.sellbayHold, 'Open', {
    kind: 'openSheet',
    tabId: KERNEL_SHEET_TAB_IDS.hold,
  })
  return { ...holdTotalsOf(state, playerId), open: withIcon(open, buttonIconIdOf('sell')) }
}

function chargingPanelOf(state: AuthorityState, playerId: string): ChargingPanel {
  const vehicle = state.players[playerId].vehicle
  const iconId = buttonIconIdOf('recharge')
  const cost = priceReading(rechargeCostOf(state, playerId))
  const recharge = withIcon(
    commandButton(state, playerId, UI_IDS.chargingRecharge, 'Recharge', rechargeEnergyCommand()),
    iconId,
  )
  const service = { item: KERNEL_ITEMS.recharge, name: 'Recharge', iconId, button: recharge, cost }
  return {
    energyText: energyGaugeText(vehicle.energy, energyMaxQuantaOf(vehicle)),
    price: statReading(toCanonical(energyUnitPrice(state.planet.index))),
    cost,
    recharge,
    rechargeCard: serviceCardOf(state, playerId, service),
  }
}

function quickServiceOf(
  state: AuthorityState,
  playerId: string,
  ui: BayUiState,
): QuickServiceReading {
  const quote = serviceQuote(state, playerId)
  const name = 'Sell, repair, recharge'
  const iconId = buttonIconIdOf('quick_service')
  const button = withIcon(
    commandButton(state, playerId, UI_IDS.platformQuickService, name, quickServiceCommand()),
    iconId,
  )
  const total = amountReading(quickServiceTotalOf(quote))
  const service = { item: KERNEL_ITEMS.quickService, name, iconId, button, cost: total }
  return {
    button,
    isHighlighted: ui.isQuickServiceHighlighted,
    total,
    card: serviceCardOf(state, playerId, service),
  }
}

/** What the quick action pays in and charges, as one net figure: sale and refined, plus charges. */
function quickServiceTotalOf(quote: ServiceQuote) {
  return add(add(add(quote.saleValue, quote.refinedValue), quote.repairCost), quote.rechargeCost)
}

function refinedButtonsOf(refined: RefinedPanel | null): ScreenButton[] {
  return refined === null ? [] : [refined.collect]
}

function sellBayFocusStops(
  hold: HoldRow,
  refined: RefinedPanel | null,
  charging: ChargingPanel,
  quickService: QuickServiceReading,
  footer: BayFooter,
): FocusStop[] {
  return [
    stopIn('quick')(quickService.button),
    stopIn('hold')(hold.open),
    ...refinedButtonsOf(refined).map(stopIn('refined')),
    stopIn('charging')(charging.recharge),
    ...footerButtonsOf(footer).map(stopIn('footer')),
  ]
}
