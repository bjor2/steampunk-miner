import { describe, expect, it } from 'vitest'
import { KERNEL_ITEMS } from '../../../systems/registries/kernelItems'
import { itemCopyProblemsOf } from '../../../systems/views/itemCopyBudget'
import { uiTextProblemsOf } from '../../../systems/views/uiTextBudget'
import { REVEAL } from './revealData'
import { revealPlateOf } from './revealPlate'
import type { UnlockReveal } from './unlockReveal'

// The reveal's words are data (`reveal.json`), held to Progression's audit (ticket 680): titles
// of 3 words or fewer, lines of 12 or fewer, and the ledger voice's bans (design-system section
// 11). A vehicle item's name is its seller's, already held to the audit by itemCopyBudget.test.ts.

const NAMES = REVEAL.items.map((row) => row.name)
/** Not in the ledger voice: no "you", no exclamation, no device word (#470 copy rule). */
const BANNED = /\byou\b|!|\bclick\b|\bhover\b|\bmouse\b/i

const GUNS_REVEAL: UnlockReveal = {
  revealed: { item: KERNEL_ITEMS.guns, name: 'Guns', iconId: 'icon-track-gun' },
  startTick: 10,
  endTick: 10 + REVEAL.revealTicks,
}

describe('unlock reveal copy', () => {
  it('keeps the title and every listed name to the #680 budgets', () => {
    const problems = [REVEAL.copy.title, REVEAL.copy.skip, ...NAMES].flatMap((title) =>
      itemCopyProblemsOf({ id: 'unlock-reveal.plate', title, hoverLines: [] }),
    )
    expect(problems).toEqual([])
  })

  it('passes the shared text budget as the plate draws it', () => {
    const lines = NAMES.map((text) => ({ text, tag: 'visible' as const }))
    const text = { id: 'unlock-reveal.plate', title: REVEAL.copy.title, oneLine: '', lines }
    expect(uiTextProblemsOf({ ...text, tooltipLines: [] })).toEqual([])
  })

  it('speaks in the ledger voice', () => {
    const words = [REVEAL.copy.title, REVEAL.copy.skip, ...NAMES]
    expect(words.filter((word) => BANNED.test(word))).toEqual([])
  })
})

describe('unlock reveal plate', () => {
  it('names the bought item under the ledger entry, and its tap skips it', () => {
    expect(revealPlateOf(GUNS_REVEAL, false)).toEqual({
      title: 'Gear fitted',
      name: 'Guns',
      iconId: 'icon-track-gun',
      skipLabel: 'Skip: Guns',
      itemKey: 'module:guns',
      hasGleam: true,
    })
  })

  it('draws no gleam under Reduce Motion', () => {
    expect(revealPlateOf(GUNS_REVEAL, true).hasGleam).toBe(false)
  })
})
