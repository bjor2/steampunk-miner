/**
 * The sale receipt's UI state (ticket 717; feature-slices.md 6.4: a slice keeps its UI state in its
 * `store/`): the receipt book, folded from every authority batch the local player's events come
 * in, and the roll's step. It never writes the game store or submits.
 *
 * The panel advances it once a frame with the authority tick, and it changes only when the roll
 * steps (`roll.steps` times in at most 1.2 s), so the receipt re-renders per step, never per
 * frame. A tap skips the roll to its end; a tap on a rolled receipt puts it away. Under Reduce
 * Motion (the shake switch, design-system section 6) the total sets at once.
 */
import { create } from 'zustand'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { bookAfterBatch, EMPTY_BOOK, type ReceiptBook } from '../systems/receiptBook'
import { RECEIPT } from '../systems/receiptData'
import { isRollDone, rollStepAt, type TripReceipt } from '../systems/tripReceipt'

interface ReceiptValues extends ReceiptBook {
  /** How far the total has rolled (`rollStepAt`), or `roll.steps` once done or skipped. */
  rollStep: number
}

interface ReceiptState extends ReceiptValues {
  /** A `listenForDomainEvents` listener: tallies the hold and gathers the trip's sales. */
  hearReceiptBatch(events: readonly DomainEvent[], playerId: string): void
  /** The frame's authority tick: steps the roll, or drops a receipt from a later tick than now. */
  advanceReceiptTo(tick: number): void
  /** The receipt's one tap: skips a rolling total, else puts the receipt away. */
  tapReceipt(): void
}

const STARTING_VALUES: ReceiptValues = { ...EMPTY_BOOK, rollStep: RECEIPT.roll.steps }

export const useReceiptStore = create<ReceiptState>()((set, get) => ({
  ...STARTING_VALUES,
  hearReceiptBatch: (events, playerId) => {
    const before = get()
    const book = bookAfterBatch(bookOf(before), { events, state: readAuthorityState(), playerId })
    if (isSameBook(before, book)) return
    set({ ...book, rollStep: rollStepAfterBatch(before, book) })
  },
  advanceReceiptTo: (tick) => {
    const { receipt, rollStep } = get()
    if (receipt === null) return
    if (tick < receipt.lastSaleTick) set(STARTING_VALUES)
    else if (hasRollMovedAt(receipt, rollStep, tick)) set({ rollStep: rollStepAt(receipt, tick) })
  },
  tapReceipt: () => {
    if (isRollDone(get().rollStep)) set({ isShown: false })
    else set({ rollStep: RECEIPT.roll.steps })
  },
}))

/** For specs' `beforeEach`. */
export function resetReceiptStore(): void {
  useReceiptStore.setState(STARTING_VALUES)
}

function bookOf({ manifest, receipt, lastTripNet, isShown, heldOre }: ReceiptValues): ReceiptBook {
  return { manifest, receipt, lastTripNet, isShown, heldOre }
}

/** Most batches carry nothing for the receipt, so the store is left as it was. */
function isSameBook(before: ReceiptBook, after: ReceiptBook): boolean {
  return (
    before.manifest === after.manifest &&
    before.receipt === after.receipt &&
    before.isShown === after.isShown &&
    before.heldOre === after.heldOre
  )
}

/** A new sale rolls from the start, at once under Reduce Motion; anything else keeps the step. */
function rollStepAfterBatch(before: ReceiptValues, after: ReceiptBook): number {
  if (!hasNewSale(before.receipt, after.receipt)) return before.rollStep
  return isMotionReduced() ? RECEIPT.roll.steps : 0
}

/** Only a sale writes a receipt; the next trip clears it. */
function hasNewSale(before: TripReceipt | null, after: TripReceipt | null): boolean {
  return after !== null && after !== before
}

/** Read every frame, so it compares numbers only. */
function hasRollMovedAt(receipt: TripReceipt, rollStep: number, tick: number): boolean {
  return !isRollDone(rollStep) && rollStepAt(receipt, tick) !== rollStep
}

function isMotionReduced(): boolean {
  return !useGameStore.getState().prefs.shake
}
