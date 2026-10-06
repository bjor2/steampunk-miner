/**
 * `selectSellBayModel` (#37 Sell bay screen): the shop rows from #33 (tier, family, amount, unit
 * value, line value, Sell, Sell all), the player's ready Refinery batches with Collect (#105), the
 * visit's lining bill with what it paid and what leaving forgives (#128), Recharge with its cost,
 * and "Sell, repair and recharge" with its exact total (refined batches included) as the focused
 * default, under the shared header and footer. A pure function of the authority replica and the
 * screen's UI state.
 */
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
import type { FocusStop } from './menuFocus'
import { UI_IDS } from './screenIds'
import { liningPanelOf, type LiningPanel } from './liningPanel'
import { refinedPanelOf, type RefinedPanel } from './refinedPanel'
import { shopPanelOf, type ShopPanel } from './shopPanel'
import {
  amountReading,
  commandButton,
  statReading,
  type AmountReading,
  type ScreenButton,
} from './viewParts'

export interface ChargingPanel {
  energyText: string
  /** Per unit; on planet 2 it has more decimals than a charge, so the text is cut to 3. */
  price: AmountReading
  cost: AmountReading
  recharge: ScreenButton
}

export interface QuickServiceReading {
  button: ScreenButton
  isHighlighted: boolean
  total: AmountReading
}

export interface SellBayModel {
  header: BayHeader
  shop: ShopPanel
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
  const shop = shopPanelOf(state, playerId)
  const refined = refinedPanelOf(state, playerId)
  const charging = chargingPanelOf(state, playerId)
  const quickService = quickServiceOf(state, playerId, ui)
  const footer = bayFooterOf(state, playerId, ui)
  return {
    header: bayHeaderOf(state, playerId, 'sell'),
    shop,
    refined,
    lining: liningPanelOf(state, playerId),
    charging,
    quickService,
    footer,
    focusStops: sellBayFocusStops(shop, refined, charging, quickService, footer),
    buttons: [
      ...shopButtonsOf(shop),
      ...refinedButtonsOf(refined),
      charging.recharge,
      quickService.button,
      ...footerButtonsOf(footer),
    ],
  }
}

function chargingPanelOf(state: AuthorityState, playerId: string): ChargingPanel {
  const vehicle = state.players[playerId].vehicle
  return {
    energyText: energyGaugeText(vehicle.energy, energyMaxQuantaOf(vehicle)),
    price: statReading(toCanonical(energyUnitPrice(state.planet.index))),
    cost: amountReading(rechargeCostOf(state, playerId)),
    recharge: commandButton(
      state,
      playerId,
      UI_IDS.chargingRecharge,
      'Recharge',
      rechargeEnergyCommand(),
    ),
  }
}

function quickServiceOf(
  state: AuthorityState,
  playerId: string,
  ui: BayUiState,
): QuickServiceReading {
  const quote = serviceQuote(state, playerId)
  return {
    button: commandButton(
      state,
      playerId,
      UI_IDS.platformQuickService,
      'Sell, repair and recharge',
      quickServiceCommand(),
    ),
    isHighlighted: ui.isQuickServiceHighlighted,
    total: amountReading(quickServiceTotalOf(quote)),
  }
}

/** What the quick action pays in and charges, as one net figure: sale and refined, plus charges. */
function quickServiceTotalOf(quote: ServiceQuote) {
  return add(add(add(quote.saleValue, quote.refinedValue), quote.repairCost), quote.rechargeCost)
}

function refinedButtonsOf(refined: RefinedPanel | null): ScreenButton[] {
  return refined === null ? [] : [refined.collect]
}

function shopButtonsOf(shop: ShopPanel): ScreenButton[] {
  return [...shop.rows.map((row) => row.sell), shop.sellAll]
}

function sellBayFocusStops(
  shop: ShopPanel,
  refined: RefinedPanel | null,
  charging: ChargingPanel,
  quickService: QuickServiceReading,
  footer: BayFooter,
): FocusStop[] {
  return [
    stopIn('quick')(quickService.button),
    ...shopButtonsOf(shop).map(stopIn('shop')),
    ...refinedButtonsOf(refined).map(stopIn('refined')),
    stopIn('charging')(charging.recharge),
    ...footerButtonsOf(footer).map(stopIn('footer')),
  ]
}
