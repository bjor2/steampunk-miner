/**
 * What the sale receipt draws (ticket 717): its words from `receipt.json`, every figure through
 * the one formatter (#681, balances and gains rounded down, the lining bill as a charge rounded up),
 * each with its exact canonical value beside it, and the lines in their rarity groups, each
 * group headed by its rarity's word in its colour (#13: never colour alone). The total is the
 * roll's step; the last trip's figure carries the compare glyph. Pure: the panel only draws it.
 */
import { cmp, ZERO_MONEY, type Money } from '../../../systems/money'
import { rarityNameOf, type RarityName } from '../../../systems/views/rarityName'
import { amountReading, priceReading, type AmountReading } from '../../../systems/views/viewParts'
import {
  countTextOf,
  deductionTextOf,
  RECEIPT,
  tierOreNameOf,
  type ReceiptData,
  type TripCompare,
} from './receiptData'
import {
  isRollDone,
  rarityGroupsOf,
  rolledTotalAt,
  tripCompareOf,
  type RarityGroup,
  type ReceiptLine,
  type TripReceipt,
} from './tripReceipt'

export interface ReceiptLineView {
  key: string
  name: string
  /** `×12`. */
  count: string
  coin: AmountReading
}

export interface ReceiptGroupView {
  key: string
  /** The rarity's word in its tint; null for the unseen group, headed by `heading` alone. */
  rarity: RarityName | null
  heading: string
  lines: readonly ReceiptLineView[]
}

export interface LastTripView {
  label: string
  /** Null on the first trip. */
  total: AmountReading | null
  compare: TripCompare | null
  glyph: string
}

export interface ReceiptView {
  title: string
  groups: readonly ReceiptGroupView[]
  lineCount: number
  /** Null when no sale of the trip paid a bill. */
  lining: { label: string; paid: AmountReading } | null
  total: { label: string; shown: AmountReading; net: AmountReading }
  lastTrip: LastTripView
  isRolling: boolean
}

export interface ReceiptReading {
  receipt: TripReceipt
  rollStep: number
  lastTripNet: Money | null
  isMotionReduced: boolean
}

export function receiptViewOf(reading: ReceiptReading, data: ReceiptData = RECEIPT): ReceiptView {
  const { receipt } = reading
  return {
    title: data.copy.title,
    groups: rarityGroupsOf(receipt.lines).map((group) => groupViewOf(group, reading, data)),
    lineCount: receipt.lines.length,
    lining: liningViewOf(receipt.liningPaid, data),
    total: {
      label: data.copy.total,
      shown: amountReading(rolledTotalAt(receipt, reading.rollStep, data)),
      net: amountReading(receipt.net),
    },
    lastTrip: lastTripViewOf(receipt.net, reading.lastTripNet, data),
    isRolling: !isRollDone(reading.rollStep, data),
  }
}

function groupViewOf(
  group: RarityGroup,
  reading: ReceiptReading,
  data: ReceiptData,
): ReceiptGroupView {
  const rarity = rarityNameOf(group.rarity, reading.isMotionReduced)
  return {
    key: rarity?.rarity ?? 'unseen',
    rarity,
    heading: rarity?.word ?? data.copy.unseenRarity,
    lines: group.lines.map((line) => lineViewOf(line, data)),
  }
}

function lineViewOf(line: ReceiptLine, data: ReceiptData): ReceiptLineView {
  return {
    key: `${line.tier}:${line.key}`,
    name: line.name ?? tierOreNameOf(line.tier, data),
    count: countTextOf(amountReading(line.count).text, data),
    coin: amountReading(line.coin),
  }
}

function liningViewOf(liningPaid: Money, data: ReceiptData): ReceiptView['lining'] {
  if (cmp(liningPaid, ZERO_MONEY) <= 0) return null
  const paid = priceReading(liningPaid)
  return { label: data.copy.lining, paid: { ...paid, text: deductionTextOf(paid.text, data) } }
}

function lastTripViewOf(net: Money, lastTripNet: Money | null, data: ReceiptData): LastTripView {
  const compare = tripCompareOf(net, lastTripNet)
  if (lastTripNet === null || compare === null) {
    return { label: data.copy.firstTrip, total: null, compare: null, glyph: '' }
  }
  return {
    label: data.copy.lastTrip,
    total: amountReading(lastTripNet),
    compare,
    glyph: data.copy.compare[compare],
  }
}
