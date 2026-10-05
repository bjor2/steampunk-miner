/**
 * The shop panel (#33 section 6, #8): one row per held ore tier with its amount, unit value and
 * line value, the units held against capacity, and "Sell all" with its exact value, all at the
 * shop's `floorMilli(V(t))` prices, or the mid-band price on a row `assay_beacon` lifts (#46).
 * Core fragments are banked on docking and never sold (#10).
 *
 * The hold counts ore by tier only (#7: value comes from the tier at sell time), so a row cannot
 * know which family its units came from; it says `mixed` and shows the tier number, never colour.
 */
import type { AuthorityState } from '../authority/authorityState'
import { isAssayLiftedFor, sellBayUnitPrice, serviceQuote } from '../authority/platformServices'
import { fromSafeInteger, mul } from '../money'
import { sellCargoCommand } from '../platform/platformCommands'
import { cargoGaugeText } from '../vehicle/vehicleReadout'
import { cargoUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'

export interface ShopRow {
  tier: number
  /** `metal`, `crystal` or `mixed`; the hold keeps no family, so a tier row is `mixed`. */
  family: 'mixed'
  amount: number
  unitValue: AmountReading
  /** `assay_beacon` priced this row at the mid-band unit value (#46: shown with an assay glyph). */
  isAssayed: boolean
  lineValue: AmountReading
  sell: ScreenButton
}

export interface ShopPanel {
  rows: ShopRow[]
  cargoTotalText: string
  sellAll: ScreenButton
  sellAllValue: AmountReading
}

export function shopPanelOf(state: AuthorityState, playerId: string): ShopPanel {
  const vehicle = state.players[playerId].vehicle
  return {
    rows: heldTiers(vehicle.cargo.ore).map(([tier, amount]) =>
      shopRowOf(state, playerId, tier, amount),
    ),
    cargoTotalText: cargoGaugeText(
      cargoUnitsOf(vehicle.cargo),
      statsOfVehicle(vehicle).cargoCapacity,
    ),
    sellAll: commandButton(
      state,
      playerId,
      UI_IDS.shopSellAll,
      'Sell all',
      sellCargoCommand('all'),
    ),
    sellAllValue: amountReading(serviceQuote(state, playerId).saleValue),
  }
}

function heldTiers(ore: Readonly<Record<string, number>>): [number, number][] {
  return Object.entries(ore)
    .map(([tier, amount]): [number, number] => [Number.parseInt(tier, 10), amount])
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a - b)
}

function shopRowOf(state: AuthorityState, playerId: string, tier: number, amount: number): ShopRow {
  const unit = sellBayUnitPrice(state, playerId, tier)
  return {
    tier,
    family: 'mixed',
    amount,
    unitValue: amountReading(unit),
    isAssayed: isAssayLiftedFor(state, playerId, tier),
    lineValue: amountReading(mul(unit, fromSafeInteger(amount))),
    sell: commandButton(
      state,
      playerId,
      UI_ID_TEMPLATES.shopSell(tier),
      'Sell',
      sellCargoCommand(tier),
    ),
  }
}
