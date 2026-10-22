import { describe, expect, it } from 'vitest'
import { itemCopyProblemsOf } from '../../../systems/views/itemCopyBudget'
import { uiTextProblemsOf } from '../../../systems/views/uiTextBudget'
import { RECEIPT, tierOreNameOf } from './receiptData'

// The receipt's words are data (`receipt.json`), held to Progression's audit (ticket 680): titles
// of 3 words or fewer, lines of 12 or fewer, and the ledger voice's bans (design-system section 11).

const LABELS = [
  RECEIPT.copy.lining,
  RECEIPT.copy.total,
  RECEIPT.copy.lastTrip,
  RECEIPT.copy.firstTrip,
  RECEIPT.copy.unseenRarity,
  tierOreNameOf(123),
]
/** Not in the ledger voice: no "you", no exclamation, no device word (#470 copy rule). */
const BANNED = /\byou\b|!|\bclick\b|\bhover\b|\bmouse\b/i

describe('sell receipt copy', () => {
  it('keeps every title and line to the #680 budgets', () => {
    const problems = [RECEIPT.copy.title, ...LABELS].flatMap((title) =>
      itemCopyProblemsOf({ id: 'sell-burst.receipt', title, hoverLines: [] }),
    )
    expect(problems).toEqual([])
  })

  it('passes the shared text budget as the panel draws it', () => {
    const lines = LABELS.map((text) => ({ text, tag: 'visible' as const }))
    const text = { id: 'sell-burst.receipt', title: RECEIPT.copy.title, oneLine: '', lines }
    expect(uiTextProblemsOf({ ...text, tooltipLines: [] })).toEqual([])
  })

  it('speaks in the ledger voice', () => {
    expect([RECEIPT.copy.title, ...LABELS].filter((label) => BANNED.test(label))).toEqual([])
  })

  it('names an unnamed tier as the Hold names it', () => {
    expect(tierOreNameOf(7)).toBe('Tier 7 ore')
  })
})
