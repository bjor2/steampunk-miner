/**
 * The trip's sale receipt (ticket 717, spec #678): every kind sold since the trip's first sale,
 * each with its count and coin, the lining bill the sales paid, and the total, which is the money
 * the sales put in the wallet, to the coin: the logged credits less the bill (`counterRoll.ts`
 * reads the same net). A kind's coin is its count at the tier's Sell bay unit price, the price the
 * authority summed the credits from (`saleValueOf`, each unit at its rounded unit price), so the
 * lines add up to the credits exactly. All Money; the panel formats each value once (#681).
 *
 * The total rolls up from what the receipt showed before the sale to the new total, in at most
 * `roll.maxTicks`, a step at a time; a tap skips to the end. Pure functions of the tick.
 */
import {
  add,
  cmp,
  div,
  floorMilli,
  fromSafeInteger,
  mul,
  sub,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import type { SeenRarity } from '../../../systems/render/seenRarity'
import type { HeldKind } from './heldManifest'
import { RECEIPT, type ReceiptData, type TripCompare } from './receiptData'

export interface ReceiptLine extends HeldKind {
  coin: Money
}

export interface TripReceipt {
  lines: readonly ReceiptLine[]
  /** The sales' logged credits, before the bill. */
  credits: Money
  liningPaid: Money
  /** What the sales added to the wallet: the credits less the bill. */
  net: Money
  /** The total the receipt showed before its last sale, where the roll starts. */
  rollFrom: Money
  lastSaleTick: number
}

/** A sale as the receipt hears it: what it took from the hold and what it paid. */
export interface ReceiptSale {
  sold: readonly HeldKind[]
  credits: Money
  liningPaid: Money
  tick: number
}

/** One rarity's lines, the richest first; `rarity` null for the unspecified lines. */
export interface RarityGroup {
  rarity: SeenRarity | null
  lines: readonly ReceiptLine[]
}

const UNSPECIFIED_LEAD = -1

/** The receipt with one more sale: its kinds merged into the lines, its money into the total. */
export function receiptWithSale(
  receipt: TripReceipt | null,
  sale: ReceiptSale,
  unitPriceOf: (tier: number) => Money,
): TripReceipt {
  const lines = sale.sold.reduce(
    (merged, kind) => linesWithKind(merged, kind, unitPriceOf(kind.tier)),
    receipt?.lines ?? [],
  )
  const credits = add(receipt?.credits ?? ZERO_MONEY, sale.credits)
  const liningPaid = add(receipt?.liningPaid ?? ZERO_MONEY, sale.liningPaid)
  return {
    lines,
    credits,
    liningPaid,
    net: sub(credits, liningPaid),
    rollFrom: receipt?.net ?? ZERO_MONEY,
    lastSaleTick: sale.tick,
  }
}

/** The lines by rarity, rarest first and the unseen last; in each, the largest coin first. */
export function rarityGroupsOf(lines: readonly ReceiptLine[]): RarityGroup[] {
  const leads = [...new Set(lines.map(leadOfLine))].sort((a, b) => b - a)
  return leads.map((lead) => ({
    rarity: lines.find((line) => leadOfLine(line) === lead)?.rarity ?? null,
    lines: lines.filter((line) => leadOfLine(line) === lead).sort(byCoinThenName),
  }))
}

/** How far the roll has come at `tick`: 0 at the sale to `roll.steps` once it is done. */
export function rollStepAt(
  receipt: TripReceipt,
  tick: number,
  data: ReceiptData = RECEIPT,
): number {
  const { maxTicks, steps } = data.roll
  const elapsed = Math.max(0, tick - receipt.lastSaleTick)
  return elapsed >= maxTicks ? steps : Math.floor((elapsed * steps) / maxTicks)
}

/** The total shown at a roll step: rounded down on the way, exactly the net at the last step. */
export function rolledTotalAt(
  receipt: TripReceipt,
  step: number,
  data: ReceiptData = RECEIPT,
): Money {
  const { steps } = data.roll
  if (step >= steps) return receipt.net
  const rise = mul(sub(receipt.net, receipt.rollFrom), fromSafeInteger(step))
  return add(receipt.rollFrom, floorMilli(div(rise, fromSafeInteger(steps))))
}

export function isRollDone(step: number, data: ReceiptData = RECEIPT): boolean {
  return step >= data.roll.steps
}

/** This trip's total against the last trip's; null on the first trip. */
export function tripCompareOf(net: Money, lastTripNet: Money | null): TripCompare | null {
  if (lastTripNet === null) return null
  const order = cmp(net, lastTripNet)
  if (order > 0) return 'up'
  return order < 0 ? 'down' : 'level'
}

function linesWithKind(
  lines: readonly ReceiptLine[],
  kind: HeldKind,
  unitPrice: Money,
): ReceiptLine[] {
  const coin = mul(unitPrice, fromSafeInteger(kind.count))
  const at = lines.findIndex((line) => line.tier === kind.tier && line.key === kind.key)
  if (at < 0) return [...lines, { ...kind, coin }]
  return lines.map((line, index) => (index === at ? mergedLineOf(line, kind, coin) : line))
}

function mergedLineOf(line: ReceiptLine, kind: HeldKind, coin: Money): ReceiptLine {
  return {
    ...line,
    count: line.count + kind.count,
    coin: add(line.coin, coin),
    rarity: line.rarity ?? kind.rarity,
  }
}

function leadOfLine(line: ReceiptLine): number {
  return line.rarity?.lead ?? UNSPECIFIED_LEAD
}

function byCoinThenName(a: ReceiptLine, b: ReceiptLine): number {
  return cmp(b.coin, a.coin) || a.key.localeCompare(b.key)
}
