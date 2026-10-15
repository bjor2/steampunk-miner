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

/** The engine plaque's three stats, each with a major and a cap, as the start bay shows them. */
const SPEED: StatLine = {
  label: 'Top speed',
  kind: 'saturating',
  now: '6',
  next: '6.01',
  delta: '0.01',
  major: { levelsTo: 10, value: '12.4' },
  cap: { value: '14', headroomPct: '57.1%' },
}

const ACCELERATION: StatLine = {
  label: 'Acceleration',
  kind: 'saturating',
  now: '1',
  next: '1.001',
  delta: '0.001',
  major: { levelsTo: 10, value: '1.03' },
  cap: { value: '1.8', headroomPct: '44.4%' },
}

const THRUST: StatLine = {
  label: 'Thrust to weight',
  kind: 'saturating',
  now: '2',
  next: '2.003',
  delta: '0.003',
  major: { levelsTo: 10, value: '2.057' },
  cap: { value: '3.5', headroomPct: '42.8%' },
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
    const description = { flavour: FLAVOUR, statLines: [DRILL, LEVEL] }
    const { text } = itemCardElementOf('upgrade-bay.drill', cardOf(description))
    expect(text.tooltipLines).toEqual([FLAVOUR, 'Major in 10: 1.68', 'Level 0 → 0 · 1/9'])
  })

  it('packs more pieces than lines by words, keeping every one of them', () => {
    const description = { flavour: FLAVOUR, statLines: [DRILL, LEVEL], unlock: 'From: shop' }
    const { text } = itemCardElementOf('upgrade-bay.drill', cardOf(description))
    expect(text.tooltipLines).toEqual([
      FLAVOUR,
      'Major in 10: 1.68 · Level 0 → 0 · 1/9 · From: shop',
    ])
  })

  // GD ruling on #425: the engine plaque's three capped stats fit the budget in compact words.
  it('fits three stats with their majors and caps into the tooltip budget', () => {
    const description = { flavour: FLAVOUR, statLines: [SPEED, ACCELERATION, THRUST, LEVEL] }
    const { text, lockReason } = itemCardElementOf('workshop.plaque-engine', cardOf(description))
    expect(text.tooltipLines).toEqual([
      FLAVOUR,
      'Major in 10: 12.4, cap 14 (57.1% to go) · ' +
        'Acceleration 1 → 1.001 +0.001, major in 10: 1.03, cap 1.8 (44.4% to go)',
      'Thrust to weight 2 → 2.003 +0.003, major in 10: 2.057, cap 3.5 (42.8% to go) · ' +
        'Level 0 → 0 · 1/9',
    ])
    expect(uiTextProblemsOf({ ...text, lines: elementLinesOf(text, [], lockReason) })).toEqual([])
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
