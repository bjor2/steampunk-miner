import { beforeEach, describe, expect, it } from 'vitest'
import { ONE_LINE_WORDS_MAX, TITLE_WORDS_MAX, TOOLTIP_LINES_MAX } from '../../constants/uiParts'
import { forgetUiTexts, recordUiText, registeredUiTexts, type UiText } from './uiText'
import { uiTextProblemsOf, wordCountOf } from './uiTextBudget'

// Spec #422 ruling 1 (build #423): the registry the budget test (#424) reads, and the budget's
// own arithmetic, as pure data.

const FOAM: UiText = {
  id: 'demo.foam',
  title: 'Stabiliser foam',
  oneLine: 'Sets foam in a forward cone; the rock hardens and holds.',
  tooltipLines: ['A grey slurry from the boiler.', 'Cured foam keeps its hardness.', 'Mark 3.'],
}

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
    const lines = [...FOAM.tooltipLines, 'One more.']
    expect(uiTextProblemsOf({ ...FOAM, tooltipLines: lines })).toEqual([
      `demo.foam: the tooltip has 4 lines, over ${TOOLTIP_LINES_MAX}`,
    ])
  })
})
