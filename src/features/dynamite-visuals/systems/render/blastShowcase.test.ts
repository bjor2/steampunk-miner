import { describe, expect, it } from 'vitest'
import {
  EMPTY_SHOWCASE_LEDGER,
  isShowcaseDue,
  ledgerAfterBlast,
  ledgerAfterPurchase,
} from './blastShowcase'

// GD 04:53 on #868: the first detonation after each charge's first purchase plays the showcase
// variant once; no per-planet arrival moment.

describe('showcase ledger (D8 #868)', () => {
  it('owes a showcase to a size bought and not yet blasted', () => {
    const ledger = ledgerAfterPurchase(EMPTY_SHOWCASE_LEDGER, 3)
    expect(isShowcaseDue(ledger, 3)).toBe(true)
    expect(isShowcaseDue(ledger, 1)).toBe(false)
  })

  it('plays the showcase once: the second blast of the size is ordinary, as is a re-purchase', () => {
    const bought = ledgerAfterPurchase(EMPTY_SHOWCASE_LEDGER, 3)
    const shown = ledgerAfterBlast(bought, 3)
    expect(isShowcaseDue(shown, 3)).toBe(false)
    expect(isShowcaseDue(ledgerAfterPurchase(shown, 3), 3)).toBe(false)
    expect(shown).toEqual({ pending: [], shown: [3] })
  })

  it('owes nothing to a blast of a size never bought this session, and keeps the ledger as it was', () => {
    const ledger = ledgerAfterPurchase(EMPTY_SHOWCASE_LEDGER, 5)
    expect(isShowcaseDue(ledger, 2)).toBe(false)
    expect(ledgerAfterBlast(ledger, 2)).toBe(ledger)
  })

  it('keeps each bought size pending in purchase order, once each', () => {
    const ledger = [4, 2, 4].reduce(ledgerAfterPurchase, EMPTY_SHOWCASE_LEDGER)
    expect(ledger.pending).toEqual([4, 2])
  })
})
