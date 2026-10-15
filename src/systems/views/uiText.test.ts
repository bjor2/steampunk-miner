import { beforeEach, describe, expect, it } from 'vitest'
import {
  FACT_LINE_WORDS_MAX,
  ONE_LINE_WORDS_MAX,
  TITLE_WORDS_MAX,
  TOOLTIP_LINE_WORDS_MAX,
  TOOLTIP_LINES_MAX,
} from '../../constants/uiParts'
import {
  elementLinesOf,
  forgetUiTexts,
  recordUiText,
  registeredUiTexts,
  type UiText,
  type UiTextLine,
} from './uiText'
import {
  uiTextBreachesOf,
  uiTextProblemsOf,
  uiTextTagProblemsOf,
  wordCountOf,
} from './uiTextBudget'

// Spec #422 ruling 1 (build #423): the registry the budget test (#424) reads, and the budget's
// own arithmetic, as pure data.

const FOAM_TOOLTIP = ['A grey slurry from the boiler.', 'Cured foam keeps its hardness.', 'Mark 3.']

const FOAM: UiText = {
  id: 'demo.foam',
  title: 'Stabiliser foam',
  oneLine: 'Sets foam in a forward cone; the rock hardens and holds.',
  tooltipLines: FOAM_TOOLTIP,
  lines: FOAM_TOOLTIP.map((text) => ({ text, tag: 'tooltip' })),
}

/** FOAM with these lines drawn besides its title and one line. */
const foamWith = (...lines: UiTextLine[]): UiText => ({ ...FOAM, lines })

const TWELVE_WORDS = 'one two three four five six seven eight nine ten eleven twelve'

describe('ui text registry', () => {
  beforeEach(forgetUiTexts)

  it('starts empty and lists what elements recorded, sorted by id', () => {
    expect(registeredUiTexts()).toEqual([])
    recordUiText({ ...FOAM, id: 'demo.z' })
    recordUiText(FOAM)
    expect(registeredUiTexts().map((text) => text.id)).toEqual(['demo.foam', 'demo.z'])
  })

  it('keeps the newest text drawn under an id', () => {
    recordUiText(FOAM)
    recordUiText({ ...FOAM, oneLine: 'Sets foam ahead.' })
    expect(registeredUiTexts()).toEqual([{ ...FOAM, oneLine: 'Sets foam ahead.' }])
  })

  it('hands the recorded text back, so an element draws what it registered', () => {
    expect(recordUiText(FOAM)).toBe(FOAM)
  })
})

describe('ui text budget', () => {
  it('counts words by whitespace, so punctuation and numbers are not words of their own', () => {
    expect(wordCountOf('Sets foam in a forward cone; the rock hardens and holds.')).toBe(11)
    expect(wordCountOf('  Drill   power ')).toBe(2)
    expect(wordCountOf('')).toBe(0)
  })

  it('accepts a text inside the budget', () => {
    expect(uiTextProblemsOf(FOAM)).toEqual([])
  })

  it('refuses a title over four words and an empty title', () => {
    const long = { ...FOAM, title: 'The great big stabiliser foam' }
    expect(uiTextProblemsOf(long)).toEqual([
      `demo.foam: the title has 5 words, over ${TITLE_WORDS_MAX}`,
    ])
    expect(uiTextProblemsOf({ ...FOAM, title: ' ' })).toEqual(['demo.foam: the title is empty'])
  })

  it('refuses a one line over twelve words or more than one sentence', () => {
    const wordy = 'Sets foam in a forward cone so that the rock hardens and then holds.'
    expect(uiTextProblemsOf({ ...FOAM, oneLine: wordy })).toEqual([
      `demo.foam: the one line has 14 words, over ${ONE_LINE_WORDS_MAX}`,
    ])
    expect(uiTextProblemsOf({ ...FOAM, oneLine: 'Sets foam. It holds.' })).toEqual([
      'demo.foam: the one line is more than one sentence',
    ])
  })

  it('lets the one line stay empty when the title stands alone', () => {
    expect(uiTextProblemsOf({ ...FOAM, oneLine: '' })).toEqual([])
  })

  it('refuses a tooltip over three lines', () => {
    const lines = [...FOAM.lines, { text: 'One more.', tag: 'tooltip' as const }]
    expect(uiTextProblemsOf(foamWith(...lines))).toEqual([
      `demo.foam: the tooltip has 4 lines, over ${TOOLTIP_LINES_MAX}`,
    ])
  })

  it('refuses a tooltip line over twelve words', () => {
    const long = `${TWELVE_WORDS} thirteen`
    expect(uiTextBreachesOf(foamWith({ text: long, tag: 'tooltip' }))).toEqual([
      {
        rule: 'tooltip',
        message: `demo.foam: the tooltip line "${long}" has 13 words, over ${TOOLTIP_LINE_WORDS_MAX}`,
      },
    ])
  })

  it('files each breach under the rule an allowlist entry counts it by', () => {
    const over = { ...FOAM, title: 'One two three four five', oneLine: 'A. B.' }
    expect(uiTextBreachesOf(over).map((breach) => breach.rule)).toEqual(['title', 'oneLine'])
  })
})

describe('ui text budget: numbers', () => {
  it('never counts a number or a compact Money as a word', () => {
    expect(wordCountOf('Sells for 1.2e149 at ×1.12 (0.41%), 1,234 or 1.00e-7%.')).toBe(4)
    expect(wordCountOf('12m · 3/9 · 1.2k')).toBe(0)
  })

  it('keeps a one line of twelve words plus compact Money values within budget', () => {
    const line = `${TWELVE_WORDS} 1.2e149 ×1.12 4,500`
    expect(uiTextProblemsOf({ ...FOAM, oneLine: line })).toEqual([])
  })
})

describe('ui text budget: tags', () => {
  it('tags facts and the lock reason visible and the tooltip lines tooltip', () => {
    const lines = elementLinesOf(FOAM, [{ text: '1.2k', holds: 'price' }, { text: '3' }], 'Sealed')
    expect(lines).toEqual([
      { text: '1.2k', tag: 'visible', holds: 'price' },
      { text: '3', tag: 'visible' },
      { text: 'Sealed', tag: 'visible', holds: 'lock' },
      ...FOAM.lines,
    ])
  })

  it('reads a lock reason naming a prereq as the Needs line', () => {
    expect(elementLinesOf(FOAM, [], 'Needs: Deep bore')[0]).toEqual({
      text: 'Needs: Deep bore',
      tag: 'visible',
      holds: 'needs',
    })
  })

  it('refuses a price, Needs, charges, warning or lock line in the tooltip', () => {
    const held = (['price', 'needs', 'charges', 'warning', 'lock'] as const).map((holds) => ({
      text: holds === 'needs' ? 'Needs: Deep bore' : '48k',
      tag: 'tooltip' as const,
      holds,
    }))
    expect(uiTextTagProblemsOf(foamWith(...held))).toHaveLength(5)
    expect(uiTextTagProblemsOf(foamWith(held[0]))).toEqual([
      'demo.foam: the price line "48k" is in the tooltip; it stays on the element',
    ])
  })

  it('refuses a Needs line that does not hold needs, so a forgotten tag cannot hide it', () => {
    const untagged = foamWith({ text: 'Needs: Deep bore', tag: 'tooltip' })
    expect(uiTextTagProblemsOf(untagged)).toEqual([
      `demo.foam: the line "Needs: Deep bore" names a Needs prereq but does not hold 'needs'`,
    ])
    const visible = foamWith({ text: 'Needs: Deep bore', tag: 'visible', holds: 'lock' })
    expect(uiTextTagProblemsOf(visible)).toHaveLength(1)
  })

  it('refuses a lock reason over twelve words and keeps one of twelve', () => {
    const long = `${TWELVE_WORDS} thirteen`
    expect(uiTextTagProblemsOf(foamWith({ text: long, tag: 'visible', holds: 'lock' }))).toEqual([
      `demo.foam: the lock line "${long}" has 13 words, over ${FACT_LINE_WORDS_MAX}`,
    ])
    const fits = foamWith({ text: TWELVE_WORDS, tag: 'visible', holds: 'lock' })
    expect(uiTextTagProblemsOf(fits)).toEqual([])
  })

  it('counts a compact-Money price line as no words at all', () => {
    const price = foamWith({ text: '1.20e149', tag: 'visible', holds: 'price' })
    expect(uiTextProblemsOf(price)).toEqual([])
  })
})
