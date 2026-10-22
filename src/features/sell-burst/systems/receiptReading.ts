/**
 * The receipt as the debug API reads it (ticket 717), for the browser specs: every value
 * canonical, so a spec compares it with the wallet's gain, never with pixels.
 */
import { toCanonical, type Money } from '../../../systems/money'
import type { ReceiptBook } from './receiptBook'
import { isRollDone, rolledTotalAt } from './tripReceipt'

export interface ReceiptReadingOut {
  isShown: boolean
  isRolling: boolean
  lines: {
    tier: number
    key: string
    name: string | null
    rarity: string | null
    count: number
    coin: string
  }[]
  credits: string | null
  liningPaid: string | null
  net: string | null
  shown: string | null
  lastTripNet: string | null
  heldKinds: number
}

export function receiptReadingOf(book: ReceiptBook & { rollStep: number }): ReceiptReadingOut {
  const { receipt } = book
  return {
    isShown: book.isShown,
    isRolling: receipt !== null && !isRollDone(book.rollStep),
    lines: (receipt?.lines ?? []).map((line) => ({
      tier: line.tier,
      key: line.key,
      name: line.name,
      rarity: line.rarity?.rarity ?? null,
      count: line.count,
      coin: toCanonical(line.coin),
    })),
    credits: canonicalOrNull(receipt?.credits),
    liningPaid: canonicalOrNull(receipt?.liningPaid),
    net: canonicalOrNull(receipt?.net),
    shown: receipt === null ? null : toCanonical(rolledTotalAt(receipt, book.rollStep)),
    lastTripNet: canonicalOrNull(book.lastTripNet ?? undefined),
    heldKinds: book.manifest.length,
  }
}

function canonicalOrNull(amount: Money | undefined): string | null {
  return amount === undefined ? null : toCanonical(amount)
}
