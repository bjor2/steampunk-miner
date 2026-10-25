/**
 * The showcase variant (D8, ticket 868; GD 04:53: no per-planet arrival moment, instead "the first
 * detonation after each charge's first purchase plays the showcase variant once", look-only): a
 * ledger of the sizes bought this session and not yet shown off, and the sizes already shown. A
 * purchase (`ChargesRestocked`) of a size never shown puts it on the list; the next `BlastStarted`
 * of that size takes it off and is the showcase, with its longer flash and name banner. Pure
 * records; nothing here reaches the authority or the log.
 */

export interface ShowcaseLedger {
  /** Sizes bought and waiting for their first blast, in purchase order. */
  pending: readonly number[]
  /** Sizes whose showcase has played. */
  shown: readonly number[]
}

export const EMPTY_SHOWCASE_LEDGER: ShowcaseLedger = { pending: [], shown: [] }

/** A size bought: pending until its first blast, unless it has had its showcase. */
export function ledgerAfterPurchase(ledger: ShowcaseLedger, size: number): ShowcaseLedger {
  if (ledger.shown.includes(size) || ledger.pending.includes(size)) return ledger
  return { ...ledger, pending: [...ledger.pending, size] }
}

/** Whether a blast of `size` plays the showcase now. */
export function isShowcaseDue(ledger: ShowcaseLedger, size: number): boolean {
  return ledger.pending.includes(size)
}

/** The ledger once a size's showcase has played (or its blast went by): shown, never pending. */
export function ledgerAfterBlast(ledger: ShowcaseLedger, size: number): ShowcaseLedger {
  if (!ledger.pending.includes(size)) return ledger
  return {
    pending: ledger.pending.filter((pending) => pending !== size),
    shown: [...ledger.shown, size],
  }
}
