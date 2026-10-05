/**
 * `selectPlatformModel` (#33 section 6): the one-page platform screen as a pure function of the
 * authority replica and two pieces of UI state (the travel confirmation, which panel has focus is
 * the screen's). Header with money, planet, core bay and platform state; the shop, workshop and
 * charging panels; the footer with the quick action, travel, undock and settings. Every button
 * carries the command it submits and the reason the authority would refuse it now.
 *
 * Travel needs a second activation because it spends fragments and cannot be undone; that is UI
 * state, and the authority still sees one `Travel`. On the slice's last planet an end-of-slice
 * card replaces travel.
 */
import { SLICE_LAST_PLANET } from '../../constants/balance'
import type { AuthorityState } from '../authority/authorityState'
import { coreNeededOf } from '../authority/coreBay'
import type { RejectionReason } from '../authority/domainEvent'
import { rechargeCostOf, repairCostOf, serviceQuote } from '../authority/platformServices'
import type { PlatformVisualState } from '../authority/platformState'
import { travelRefusal } from '../authority/travelRules'
import { energyUnitPrice, travelFee } from '../economy/planetCharges'
import { add, toCanonical } from '../money'
import {
  quickServiceCommand,
  rechargeEnergyCommand,
  repairHullCommand,
  travelCommand,
  undockCommand,
} from '../platform/platformCommands'
import { visualTier } from '../economy/vehicleStats'
import { energyGaugeText, hullGaugeText } from '../vehicle/vehicleReadout'
import { energyMaxQuantaOf, statsOfVehicle } from '../vehicle/vehicleState'
import type { GaugeReading } from './hudModel'
import type { FocusStop } from './menuFocus'
import { shopPanelOf, type ShopPanel } from './shopPanel'
import {
  amountReading,
  commandButton,
  statReading,
  uiButton,
  type AmountReading,
  type ScreenButton,
} from './viewParts'
import { workshopRowsOf, type WorkshopRow } from './workshopRows'
import { UI_IDS } from './screenIds'

export interface PlatformUiState {
  isTravelArmed: boolean
  /** While the dock hint is up, its first visit (#16). */
  isQuickServiceHighlighted: boolean
}

export interface PlatformHeader {
  money: AmountReading
  planet: number
  /** The bay against `coreNeeded` (#8, #33): "17 / 63" and a brass dial. */
  coreBay: GaugeReading
  platformState: PlatformVisualState
  platformStateText: string
}

export interface WorkshopPanel {
  upgrades: WorkshopRow[]
  hullText: string
  repair: ScreenButton
  repairCost: AmountReading
  visualTier: number
}

export interface ChargingPanel {
  energyText: string
  /** Per unit; on planet 2 it has more decimals than a charge, so the text is cut to 3. */
  price: AmountReading
  cost: AmountReading
  recharge: ScreenButton
}

/** `ready`, or the reason the authority refuses `Travel` now (`core_short`, `money_short`, ...). */
export type TravelState = 'ready' | RejectionReason

export interface TravelReading {
  button: ScreenButton
  fee: AmountReading
  fragmentsText: string
  state: TravelState
  isArmed: boolean
}

export interface PlatformFooter {
  quickService: ScreenButton
  isQuickServiceHighlighted: boolean
  quickTotal: AmountReading
  /** Null on the slice's last planet, where the end-of-slice card stands instead. */
  travel: TravelReading | null
  hasEndCard: boolean
  undock: ScreenButton
  settings: ScreenButton
}

export interface PlatformModel {
  header: PlatformHeader
  shop: ShopPanel
  workshop: WorkshopPanel
  charging: ChargingPanel
  footer: PlatformFooter
  /** Every button in reading order with its panel, for keyboard focus. */
  focusStops: FocusStop[]
}

/** Opening the screen focuses the quick action (#33 section 6). */
export const PLATFORM_START_FOCUS: string = UI_IDS.platformQuickService

const PLATFORM_STATE_TEXT: Readonly<Record<PlatformVisualState, string>> = {
  outpost: 'Outpost',
  core_drive: 'Core drive',
}

export function selectPlatformModel(
  state: AuthorityState,
  playerId: string,
  ui: PlatformUiState,
): PlatformModel {
  const shop = shopPanelOf(state, playerId)
  const workshop = workshopPanelOf(state, playerId)
  const charging = chargingPanelOf(state, playerId)
  const footer = footerOf(state, playerId, ui)
  return {
    header: headerOf(state, playerId),
    shop,
    workshop,
    charging,
    footer,
    focusStops: focusStopsOf(shop, workshop, charging, footer),
  }
}

function headerOf(state: AuthorityState, playerId: string): PlatformHeader {
  const needed = coreNeededOf(state.planet) ?? 0
  return {
    money: amountReading(state.players[playerId].wallet),
    planet: state.planet.index,
    coreBay: coreBayGaugeOf(state.platform.coreBay, needed),
    platformState: state.platform.visualState,
    platformStateText: PLATFORM_STATE_TEXT[state.platform.visualState],
  }
}

function coreBayGaugeOf(coreBay: number, needed: number): GaugeReading {
  const permille = needed > 0 ? Math.min(Math.floor((coreBay * 1000) / needed), 1000) : 0
  return { text: `${coreBay} / ${needed}`, exact: String(coreBay), permille }
}

function workshopPanelOf(state: AuthorityState, playerId: string): WorkshopPanel {
  const vehicle = state.players[playerId].vehicle
  return {
    upgrades: workshopRowsOf(state, playerId),
    hullText: hullGaugeText(vehicle.hull, statsOfVehicle(vehicle).hullMax),
    repair: commandButton(state, playerId, UI_IDS.workshopRepair, 'Repair', repairHullCommand()),
    repairCost: amountReading(repairCostOf(state, playerId)),
    visualTier: visualTier(vehicle.levels),
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

function footerOf(state: AuthorityState, playerId: string, ui: PlatformUiState): PlatformFooter {
  const quote = serviceQuote(state, playerId)
  const hasEndCard = state.planet.index >= SLICE_LAST_PLANET
  return {
    quickService: commandButton(
      state,
      playerId,
      UI_IDS.platformQuickService,
      'Sell, repair and recharge',
      quickServiceCommand(),
    ),
    isQuickServiceHighlighted: ui.isQuickServiceHighlighted,
    quickTotal: amountReading(add(add(quote.saleValue, quote.repairCost), quote.rechargeCost)),
    travel: hasEndCard ? null : travelReadingOf(state, playerId, ui.isTravelArmed),
    hasEndCard,
    undock: commandButton(state, playerId, UI_IDS.platformUndock, 'Undock', undockCommand()),
    settings: uiButton(UI_IDS.platformSettings, 'Settings', { kind: 'openSettings' }),
  }
}

/** The first activation arms the confirmation; only an armed button submits `Travel`. */
function travelReadingOf(state: AuthorityState, playerId: string, isArmed: boolean): TravelReading {
  const toPlanet = state.planet.index + 1
  const reason = travelRefusal(state, playerId, toPlanet)?.reason ?? null
  return {
    button: {
      id: UI_IDS.platformTravel,
      label: isArmed ? `Confirm travel to planet ${toPlanet}` : `Travel to planet ${toPlanet}`,
      action: isArmed ? { kind: 'submit', intent: travelCommand(toPlanet) } : { kind: 'armTravel' },
      reason,
    },
    fee: amountReading(travelFee(state.planet.index)),
    fragmentsText: `${state.platform.coreBay} / ${coreNeededOf(state.planet) ?? 0}`,
    state: reason ?? 'ready',
    isArmed,
  }
}

function focusStopsOf(
  shop: ShopPanel,
  workshop: WorkshopPanel,
  charging: ChargingPanel,
  footer: PlatformFooter,
): FocusStop[] {
  const footerButtons = [footer.quickService, footer.travel?.button, footer.undock, footer.settings]
  return [
    ...[...shop.rows.map((row) => row.sell), shop.sellAll].map(stopIn('shop')),
    ...[...workshop.upgrades.map((row) => row.buy), workshop.repair].map(stopIn('workshop')),
    stopIn('charging')(charging.recharge),
    ...footerButtons.filter((button) => button !== undefined).map(stopIn('footer')),
  ]
}

function stopIn(panel: string): (button: ScreenButton) => FocusStop {
  return (button) => ({ id: button.id, panel })
}
