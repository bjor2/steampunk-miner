import { describe, expect, it } from 'vitest'
import type { ItemDescription, StatLine } from '../registries/itemDescriber'
import { itemCardElementOf } from './itemCardElement'
import type { ItemCardModel } from './itemCardModel'
import { uiTextProblemsOf } from './uiTextBudget'
import { elementLinesOf } from './uiText'

// Pass #425 on spec #422: a shop card on the shared element, by Content's mapping (comment
// 6197594891). The title is the name, the one line the first stat with its change, the tooltip the
// flavour, then the caveats, then the source line; nothing of the card is dropped.

const DRILL: StatLine = {
  label: 'Drill power',
  kind: 'geometric',
  now: '1.5',
  next: '1.509',
  delta: '0.009',
  deltaPct: '0.631%',
  major: { levelsTo: 10, value: '1.68' },
}

const LEVEL: StatLine = { label: 'Level', kind: 'linearInt', now: '0', next: '0 · 1/9' }

const FLAVOUR = 'Heavier gearing drives the drill head harder through every band.'

function cardOf(description: ItemDescription | null): ItemCardModel {
  return {
    item: { kind: 'track', id: 'drill_power' },
    iconId: 'icon-track-drill-power',
    name: 'Drill power',
    cost: { text: '1', exact: '1e+0' },
    isMoneyShort: false,
    description,
  }
}

describe('item card element', () => {
  it('titles the card by its name and shows the first stat with its change as the one line', () => {
    const { text } = itemCardElementOf(
      'upgrade-bay.drill',
      cardOf({ flavour: FLAVOUR, statLines: [DRILL] }),
    )
    expect(text.title).toBe('Drill power')
    expect(text.oneLine).toBe('Drill power 1.5 → 1.509 +0.009 (+0.631%)')
  })

  it('puts the flavour first in the tooltip, then the next major, then the other stat lines', () => {
    const description = { flavour: FLAVOUR, statLines: [DRILL, LEVEL], unlock: 'From: shop' }
    const { text } = itemCardElementOf('upgrade-bay.drill', cardOf(description))
    expect(text.tooltipLines).toEqual([
      FLAVOUR,
      'Next major in 10: 1.68',
      'Level 0 → 0 · 1/9 · From: shop',
    ])
  })

  it('keeps a card of the start bay within the text budget', () => {
    const description = { flavour: FLAVOUR, statLines: [DRILL, LEVEL] }
    const { text, lockReason } = itemCardElementOf('upgrade-bay.drill', cardOf(description))
    expect(uiTextProblemsOf({ ...text, lines: elementLinesOf(text, [], lockReason) })).toEqual([])
  })

  it('keeps a Needs unlock line on the element as its lock reason, never in the tooltip', () => {
    const description = { flavour: FLAVOUR, statLines: [DRILL], unlock: 'Needs: Drill tip 3' }
    const element = itemCardElementOf('upgrade-bay.drill', cardOf(description))
    expect(element.lockReason).toBe('Needs: Drill tip 3')
    expect(element.text.tooltipLines.join(' ')).not.toContain('Needs:')
  })

  it('draws the bare name while no describer answers', () => {
    const element = itemCardElementOf('upgrade-bay.drill', cardOf(null))
    expect(element).toEqual({
      text: { id: 'upgrade-bay.drill', title: 'Drill power', oneLine: '', tooltipLines: [] },
      lockReason: null,
    })
  })
})
