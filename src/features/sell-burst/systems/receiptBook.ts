/**
 * What the receipt keeps between batches (ticket 717): the hold's kinds as they came in, this
 * trip's receipt, the last trip's total and whether the receipt shows. A trip's receipt gathers
 * every sale until the next unit reaches the hold, which starts the next trip and keeps the old
 * total as the last trip's; a sale shows the receipt and leaving the dock puts it away. The last
 * trip lives as long as the session (a save keeps no receipt: presentation only).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { sellBayUnitPrice } from '../../../systems/authority/platformServices'
import { ZERO_MONEY, type Money } from '../../../systems/money'
import {
  EMPTY_MANIFEST,
  manifestWithinHold,
  manifestWithUnit,
  takeSoldKinds,
  type HeldManifest,
} from './heldManifest'
import { heldUnitsOf } from './heldUnits'
import { hasSaleBy, salesOfBatch, type HeardSale } from './salesOfBatch'
import { receiptWithSale, type TripReceipt } from './tripReceipt'

export interface ReceiptBook {
  manifest: HeldManifest
  receipt: TripReceipt | null
  /** The last trip's total; null until a trip with a sale has ended. */
  lastTripNet: Money | null
  isShown: boolean
  /** The hold the manifest was last cut back to, so an unchanged hold costs nothing. */
  heldOre: Readonly<Record<string, number>> | null
}

/** One authority batch as the receipt hears it: the events and the state they answered. */
export interface ReceiptBatch {
  events: readonly DomainEvent[]
  state: AuthorityState
  playerId: string
}

export const EMPTY_BOOK: ReceiptBook = {
  manifest: EMPTY_MANIFEST,
  receipt: null,
  lastTripNet: null,
  isShown: false,
  heldOre: null,
}

export function bookAfterBatch(book: ReceiptBook, batch: ReceiptBatch): ReceiptBook {
  const stocked = bookWithUnitsHeard(book, batch)
  const sold = bookWithSalesHeard(stocked, batch)
  const left = hasLeftDock(batch) ? { ...sold, isShown: false } : sold
  return bookWithinHold(left, batch)
}

function bookWithUnitsHeard(book: ReceiptBook, batch: ReceiptBatch): ReceiptBook {
  const units = heldUnitsOf(batch.events, batch.state, batch.playerId)
  if (units.length === 0) return book
  const manifest = units.reduce(manifestWithUnit, book.manifest)
  return { ...bookOnNextTrip(book), manifest }
}

/** The trip's receipt becomes the last trip's total; a trip that sold nothing keeps the old one. */
function bookOnNextTrip(book: ReceiptBook): ReceiptBook {
  if (book.receipt === null) return book
  return { ...book, receipt: null, lastTripNet: book.receipt.net, isShown: false }
}

/** The flare's next step price is the burst's; the receipt reads none. */
function bookWithSalesHeard(book: ReceiptBook, batch: ReceiptBatch): ReceiptBook {
  if (!hasSaleBy(batch.events, batch.playerId)) return book
  const sales = salesOfBatch(batch.events, batch.playerId, ZERO_MONEY)
  return sales.reduce((running, sale) => bookWithSale(running, sale, batch), book)
}

/** The sale's kinds leave the manifest for the receipt, priced as the authority priced them. */
function bookWithSale(
  book: ReceiptBook,
  { sale, tick }: HeardSale,
  batch: ReceiptBatch,
): ReceiptBook {
  const { sold, manifest } = takeSoldKinds(book.manifest, sale.items)
  const unitPriceOf = (tier: number) => sellBayUnitPrice(batch.state, batch.playerId, tier)
  const heard = { sold, credits: sale.credits, liningPaid: sale.liningPaid, tick }
  return {
    ...book,
    manifest,
    receipt: receiptWithSale(book.receipt, heard, unitPriceOf),
    isShown: true,
  }
}

function bookWithinHold(book: ReceiptBook, batch: ReceiptBatch): ReceiptBook {
  const { ore } = vehicleOf(batch.state, batch.playerId).cargo
  if (ore === book.heldOre) return book
  return { ...book, manifest: manifestWithinHold(book.manifest, ore), heldOre: ore }
}

function hasLeftDock(batch: ReceiptBatch): boolean {
  return batch.events.some(
    (event) => event.type === 'DockLeft' && event.playerId === batch.playerId,
  )
}
