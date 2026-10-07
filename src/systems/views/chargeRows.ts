/**
 * The Upgrade bay's blasting charge rows (#109 design "Supply", sizes K8 #218): shown once
 * `blasting_charges` is open on this planet (planet 7) or the rack is already bolted on, and
 * nothing before (#90). One Charges row per size open here, smallest first, buys as many of that
 * size as the rack's free slots hold at the size's price (the first buy bolts the rack on); the
 * Rack row adds one slot, "3 → 4", up to the top, where it says so and its Buy carries
 * `max_level`. Charges restock here only, never at the Sell bay.
 */
import { BLASTING_CHARGES_ICON_ID, CHARGE_RACK_ICON_ID } from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { chargesOf } from '../authority/charges/chargeRules'
import {
  areChargesOffered,
  rackSlotPriceOf,
  restockPriceOf,
} from '../authority/charges/chargeShopRules'
import { rackMaxSlotLevel } from '../economy/blastingCharges'
import { chargeSizesUpTo, largestSizeOn } from '../economy/chargeSizes'
import { buyChargeRackSlotCommand, restockChargesCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import type { ItemRef } from '../registries/itemDescriber'
import { carriedOf, chargesThatFitOf, rackCapacityOf } from '../vehicle/vehicleCharges'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState, type RowBadge } from './workshopRows'

/** The ids one row's cells carry; the Buy button's is on `buy`. */
export interface ChargeRowIds {
  row: string
  level: string
  cost: string
  effect: string
}

export interface ChargeRow {
  ids: ChargeRowIds
  iconId: string
  label: string
  /** "2/3" carried of what fits for a Charges row; "3 → 4" or "8 (top)" for the Rack row. */
  levelText: string
  effectText: string
  /** Null at the rack's top size, where nothing is left to buy. */
  cost: AmountReading | null
  buy: ScreenButton
  buyState: BuyState
  /** A padlock before the rack is bolted on; a star on the Rack row at its top size. */
  badge: RowBadge
  isBuyOpen: boolean
  /** The kernel item card this row draws as, compact (K7 #199). */
  card: ItemCardModel
}

export interface ChargeRows {
  /** One Charges row per size open here, size 1 (the shipped charge) first. */
  restock: readonly ChargeRow[]
  rack: ChargeRow
}

const SHIPPED_SIZE = 1

const RACK_IDS: ChargeRowIds = {
  row: UI_IDS.upgradebayRack,
  level: UI_IDS.upgradebayRackSize,
  cost: UI_IDS.upgradebayRackCost,
  effect: UI_IDS.upgradebayRackEffect,
}

/** The rows, or null while the Upgrade bay shows no charges. */
export function chargeRowsOf(state: AuthorityState, playerId: string): ChargeRows | null {
  if (!areChargesOffered(state, playerId)) return null
  return {
    restock: offeredSizesOf(state).map((size) => restockRowOf(state, playerId, size)),
    rack: rackRowOf(state, playerId),
  }
}

/** The rows' buttons in reading order; none while no charges are offered. */
export function chargeButtonsOf(rows: ChargeRows | null): ScreenButton[] {
  return rows === null ? [] : [...rows.restock.map((row) => row.buy), rows.rack.buy]
}

/** Size 1 wherever the rows show, and every size open on this planet. */
function offeredSizesOf(state: AuthorityState): number[] {
  return chargeSizesUpTo(Math.max(SHIPPED_SIZE, largestSizeOn(state.planet.index)))
}

/** A rack with no room still offers one charge, so the button names why it is refused. */
function restockRowOf(state: AuthorityState, playerId: string, size: number): ChargeRow {
  const charges = chargesOf(state, playerId)
  const fitting = chargesThatFitOf(charges, size)
  const carried = carriedOf(charges, size)
  const buy = commandButton(
    state,
    playerId,
    restockButtonIdOf(size),
    charges.isRackMounted ? 'Restock' : 'Buy rack',
    restockChargesCommand(size, Math.max(fitting, 1)),
  )
  const cost = amountReading(restockPriceOf(state, size, fitting))
  const label = size === SHIPPED_SIZE ? 'Charges' : `Charges size ${size}`
  return {
    ids: restockRowIdsOf(size),
    iconId: BLASTING_CHARGES_ICON_ID,
    label,
    levelText: `${carried}/${carried + fitting}`,
    effectText: fitting === 0 ? 'rack full' : `+${fitting} charges`,
    cost,
    buy,
    buyState: buyStateOf(buy),
    badge: charges.isRackMounted ? null : 'locked',
    isBuyOpen: isBuyOpen(buy),
    card: itemCardOf(state, playerId, {
      item: chargeItemOf(size),
      iconId: BLASTING_CHARGES_ICON_ID,
      name: label,
      cost,
      level: carried,
      buy,
      source: SHOP_SOURCE,
    }),
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
    buyChargeRackSlotCommand(CLICK_CHAIN),
  )
  const capacity = rackCapacityOf(charges)
  const cost = isTop ? null : amountReading(rackSlotPriceOf(state, playerId))
  return {
    ids: RACK_IDS,
    iconId: CHARGE_RACK_ICON_ID,
    label: 'Rack',
    levelText: isTop ? `${capacity} (top)` : `${capacity} → ${capacity + 1}`,
    effectText: isTop ? `${capacity} slots` : `${capacity + 1} slots`,
    cost,
    buy,
    buyState: buyStateOf(buy),
    badge: isTop ? 'maxed' : null,
    isBuyOpen: isBuyOpen(buy),
    card: itemCardOf(state, playerId, {
      item: KERNEL_ITEMS.chargeRack,
      iconId: CHARGE_RACK_ICON_ID,
      name: 'Rack',
      cost,
      level: charges.slotLevel,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}

/** The shipped charge keeps its item ref; a bigger size is the same item at its size (K7 grade). */
function chargeItemOf(size: number): ItemRef {
  return size === SHIPPED_SIZE ? KERNEL_ITEMS.charges : { ...KERNEL_ITEMS.charges, grade: size }
}

/** Size 1 keeps the shipped Charges row's ids; the bigger sizes take theirs from a template. */
function restockRowIdsOf(size: number): ChargeRowIds {
  if (size === SHIPPED_SIZE) {
    return {
      row: UI_IDS.upgradebayCharges,
      level: UI_IDS.upgradebayChargesCarried,
      cost: UI_IDS.upgradebayChargesCost,
      effect: UI_IDS.upgradebayChargesEffect,
    }
  }
  return {
    row: UI_ID_TEMPLATES.upgradebayChargeSize(size),
    level: UI_ID_TEMPLATES.upgradebayChargeSizeCarried(size),
    cost: UI_ID_TEMPLATES.upgradebayChargeSizeCost(size),
    effect: UI_ID_TEMPLATES.upgradebayChargeSizeEffect(size),
  }
}

function restockButtonIdOf(size: number): string {
  if (size === SHIPPED_SIZE) return UI_IDS.upgradebayChargesRestock
  return UI_ID_TEMPLATES.upgradebayChargeSizeRestock(size)
}
