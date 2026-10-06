/**
 * The Upgrade bay's blasting charge rows (#109 design "Supply"): shown once `blasting_charges` is
 * open on this planet (planet 7) or the rack is already bolted on, and nothing before (#90). The
 * Charges row fills the rack's empty slots at the price per charge (the first buy bolts the rack
 * on); the Rack row adds one slot, "3 → 4", up to the top, where it says so and its Buy carries
 * `max_level`. Charges restock here only, never at the Sell bay.
 */
import { BLASTING_CHARGES_ICON_ID, CHARGE_RACK_ICON_ID } from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import {
  areChargesOffered,
  chargesOf,
  rackSlotPriceOf,
  restockPriceOf,
} from '../authority/charges/chargeRules'
import { rackMaxSlotLevel } from '../economy/blastingCharges'
import { buyChargeRackSlotCommand, restockChargesCommand } from '../platform/platformCommands'
import { emptyRackSlotsOf, rackCapacityOf, type VehicleCharges } from '../vehicle/vehicleCharges'
import { UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState, type RowBadge } from './workshopRows'

export interface ChargeRow {
  iconId: string
  label: string
  /** "2/3" carried for the Charges row; "3 → 4" or "8 (top)" for the Rack row. */
  levelText: string
  effectText: string
  /** Null at the rack's top size, where nothing is left to buy. */
  cost: AmountReading | null
  buy: ScreenButton
  buyState: BuyState
  /** A padlock before the rack is bolted on; a star on the Rack row at its top size. */
  badge: RowBadge
  isBuyOpen: boolean
}

export interface ChargeRows {
  restock: ChargeRow
  rack: ChargeRow
}

/** The two rows, or null while the Upgrade bay shows no charges. */
export function chargeRowsOf(state: AuthorityState, playerId: string): ChargeRows | null {
  if (!areChargesOffered(state, playerId)) return null
  return { restock: restockRowOf(state, playerId), rack: rackRowOf(state, playerId) }
}

/** The rows' buttons in reading order; none while no charges are offered. */
export function chargeButtonsOf(rows: ChargeRows | null): ScreenButton[] {
  return rows === null ? [] : [rows.restock.buy, rows.rack.buy]
}

function restockRowOf(state: AuthorityState, playerId: string): ChargeRow {
  const charges = chargesOf(state, playerId)
  const buy = commandButton(
    state,
    playerId,
    UI_IDS.upgradebayChargesRestock,
    charges.isRackMounted ? 'Restock' : 'Buy rack',
    restockChargesCommand(),
  )
  return {
    iconId: BLASTING_CHARGES_ICON_ID,
    label: 'Charges',
    levelText: `${charges.carried}/${rackCapacityOf(charges)}`,
    effectText: restockEffectOf(charges),
    cost: amountReading(restockPriceOf(state, playerId)),
    buy,
    buyState: buyStateOf(buy),
    badge: charges.isRackMounted ? null : 'locked',
    isBuyOpen: isBuyOpen(buy),
  }
}

function rackRowOf(state: AuthorityState, playerId: string): ChargeRow {
  const charges = chargesOf(state, playerId)
  const isTop = charges.slotLevel >= rackMaxSlotLevel()
  const buy = commandButton(
    state,
    playerId,
    UI_IDS.upgradebayRackBuy,
    'Buy',
    buyChargeRackSlotCommand(),
  )
  const capacity = rackCapacityOf(charges)
  return {
    iconId: CHARGE_RACK_ICON_ID,
    label: 'Rack',
    levelText: isTop ? `${capacity} (top)` : `${capacity} → ${capacity + 1}`,
    effectText: isTop ? `${capacity} charges` : `${capacity + 1} charges`,
    cost: isTop ? null : amountReading(rackSlotPriceOf(state, playerId)),
    buy,
    buyState: buyStateOf(buy),
    badge: isTop ? 'maxed' : null,
    isBuyOpen: isBuyOpen(buy),
  }
}

function restockEffectOf(charges: VehicleCharges): string {
  const empty = emptyRackSlotsOf(charges)
  return empty === 0 ? 'rack full' : `+${empty} charges`
}
