/**
 * The Upgrade bay's blasting charge rows (#109 design "Supply", sizes K8 #218): shown on every
 * planet, every size, price the only gate (D4 #863). One Charges row per size, smallest first,
 * buys as many of that size as the rack's free slots hold at the size's price (the first buy
 * bolts the rack on); the
 * Rack row adds one slot, "3 → 4", up to the top, where it says so and its Buy carries
 * `max_level`. The Blast Radius row (D9 #869) raises the rig's level, "0 → 1", with no top: every
 * charge the rig blows clears that many times its rung's radius. Charges restock here only, never
 * at the Sell bay.
 */
import {
  BLAST_RADIUS_ICON_ID,
  BLASTING_CHARGES_ICON_ID,
  CHARGE_RACK_ICON_ID,
} from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { chargesOf } from '../authority/charges/chargeRules'
import { blastRadiusPriceOf } from '../authority/charges/blastRadiusRules'
import { rackSlotPriceOf, restockPriceOf } from '../authority/charges/chargeShopRules'
import { blastRadiusMultipleAt, rackMaxSlotLevel } from '../economy/blastingCharges'
import { chargeSizeCount, chargeSizesUpTo } from '../economy/chargeSizes'
import {
  buyBlastRadiusLevelCommand,
  buyChargeRackSlotCommand,
  restockChargesCommand,
} from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import type { ItemRef } from '../registries/itemDescriber'
import {
  blastRadiusLevelOf,
  carriedOf,
  chargesThatFitOf,
  rackCapacityOf,
} from '../vehicle/vehicleCharges'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { priceReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState, type RowBadge } from './workshopRows'

export interface ChargeRow {
  /**
   * `charges` for the shipped size, `charges-<size>` for a bigger one, `rack`, `blast-radius`: the
   * row's name.
   */
  key: string
  iconId: string
  label: string
  /**
   * "2/3" carried of what fits for a Charges row; "3 → 4" or "8 (top)" for the Rack row; "0 → 1"
   * for the Blast Radius row.
   */
  levelText: string
  effectText: string
  /** Null at the rack's top size, where nothing is left to buy; the Blast Radius row has no top. */
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
  /** One Charges row per size, size 1 (the shipped charge) first. */
  restock: readonly ChargeRow[]
  rack: ChargeRow
  /** The Blast Radius level line: every blast clears more ground, the danger zone stays. */
  radius: ChargeRow
}

const SHIPPED_SIZE = 1

export function chargeRowsOf(state: AuthorityState, playerId: string): ChargeRows {
  return {
    restock: chargeSizesUpTo(chargeSizeCount()).map((size) => restockRowOf(state, playerId, size)),
    rack: rackRowOf(state, playerId),
    radius: blastRadiusRowOf(state, playerId),
  }
}

/** The rows' buttons in reading order. */
export function chargeButtonsOf(rows: ChargeRows): ScreenButton[] {
  return [...rows.restock.map((row) => row.buy), rows.rack.buy, rows.radius.buy]
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
  const cost = priceReading(restockPriceOf(state, size, fitting))
  const label = size === SHIPPED_SIZE ? 'Charges' : `Charges size ${size}`
  return {
    key: restockKeyOf(size),
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
  const cost = isTop ? null : priceReading(rackSlotPriceOf(state, playerId))
  return {
    key: 'rack',
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

/** "×1.03 blast radius": what the next level makes every blast clear, against its rung's radius. */
function blastRadiusRowOf(state: AuthorityState, playerId: string): ChargeRow {
  const level = blastRadiusLevelOf(chargesOf(state, playerId))
  const buy = commandButton(
    state,
    playerId,
    UI_IDS.upgradebayBlastRadiusBuy,
    'Buy',
    buyBlastRadiusLevelCommand(CLICK_CHAIN),
  )
  const cost = priceReading(blastRadiusPriceOf(state, playerId))
  return {
    key: 'blast-radius',
    iconId: BLAST_RADIUS_ICON_ID,
    label: 'Blast Radius',
    levelText: `${level} → ${level + 1}`,
    effectText: `×${blastRadiusMultipleAt(level + 1).toFixed(2)} blast radius`,
    cost,
    buy,
    buyState: buyStateOf(buy),
    badge: null,
    isBuyOpen: isBuyOpen(buy),
    card: itemCardOf(state, playerId, {
      item: KERNEL_ITEMS.blastRadius,
      iconId: BLAST_RADIUS_ICON_ID,
      name: 'Blast Radius',
      cost,
      level,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}

/** The shipped charge keeps its item ref; a bigger size is the same item at its size (K7 grade). */
function chargeItemOf(size: number): ItemRef {
  return size === SHIPPED_SIZE ? KERNEL_ITEMS.charges : { ...KERNEL_ITEMS.charges, grade: size }
}

/** Size 1 keeps the shipped Charges row's name; the bigger sizes add theirs. */
function restockKeyOf(size: number): string {
  return size === SHIPPED_SIZE ? 'charges' : `charges-${size}`
}

function restockButtonIdOf(size: number): string {
  if (size === SHIPPED_SIZE) return UI_IDS.upgradebayChargesRestock
  return UI_ID_TEMPLATES.upgradebayChargeSizeRestock(size)
}
