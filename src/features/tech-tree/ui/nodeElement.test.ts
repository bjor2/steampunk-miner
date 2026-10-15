import { describe, expect, it } from 'vitest'
import type { NodeCardModel } from '../systems/nodeCardModel'
import {
  nodeCardElementOf,
  nodeChipElementOf,
  nodeRowElementOf,
  wrappedLinesOf,
} from './nodeElement'

const SHORT_LINE = 'A cam-driven hammer shakes the bit until soft ground crumbles ahead.'
const LONG_LINE = 'Each bore rings the stone like a sounder and the ore beside it answers back.'

function cardOf(overrides: Partial<NodeCardModel>): NodeCardModel {
  return {
    id: 'tech.drill.vibratory_bit',
    name: 'Vibratory bit',
    iconId: 'icon-vibratory-bit',
    lane: 'drill-gear',
    tier: 3,
    kind: 'capability',
    label: 'horizontal',
    description: SHORT_LINE,
    notes: [],
    itemId: 'vibratory_bit',
    status: 'locked',
    refusal: 'missing_prereq',
    refusalText: 'Needs: Echo sounder',
    costText: '32,696',
    prereqNames: ['Echo sounder'],
    prereqText: 'Echo sounder',
    markChip: null,
    ...overrides,
  }
}

describe('tech tree node element', () => {
  it('wraps a card line over one tooltip line into even lines, keeping every word', () => {
    const lines = wrappedLinesOf(LONG_LINE)
    expect(lines).toHaveLength(2)
    expect(lines.join(' ')).toBe(LONG_LINE)
  })

  it('shows a short card line as the one line and a long one in the tooltip', () => {
    expect(nodeRowElementOf(cardOf({})).text.oneLine).toBe(SHORT_LINE)
    const long = nodeRowElementOf(cardOf({ description: LONG_LINE })).text
    expect(long.oneLine).toBe('')
    expect(long.tooltipLines.join(' ')).toBe(LONG_LINE)
  })

  it('keeps the price on a chip and its card line in the tooltip', () => {
    const chip = nodeChipElementOf(cardOf({}), 'map')
    expect(chip.facts.map((fact) => [fact.text, fact.holds])).toEqual([['32,696', 'price']])
    expect(chip.text.tooltipLines).toEqual([SHORT_LINE])
  })

  it('says on the row why a locked node is locked, and not for one only the wallet stops', () => {
    expect(nodeRowElementOf(cardOf({})).lockReason).toBe('Needs: Echo sounder')
    const short = cardOf({
      status: 'available',
      refusal: 'money_short',
      refusalText: 'Price: 32,696',
    })
    expect(nodeRowElementOf(short).lockReason).toBeNull()
    expect(nodeCardElementOf(short).lockReason).toBe('Price: 32,696')
  })

  it('keeps a stacking note on the element as a warning', () => {
    const note = "Note: doesn't stack with the reach boom; the longer cut ahead wins"
    const card = nodeCardElementOf(cardOf({ notes: [note] }))
    expect(card.facts.find((fact) => fact.text === note)?.holds).toBe('warning')
  })

  it('puts what the card builds on and unlocks in its tooltip', () => {
    const lines = nodeCardElementOf(cardOf({})).text.tooltipLines
    expect(lines).toEqual(['Builds on: Echo sounder', 'Unlocks: vibratory_bit', 'Horizontal'])
  })
})
