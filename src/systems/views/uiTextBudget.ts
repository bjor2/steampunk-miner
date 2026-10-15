/**
 * The text budget (spec #422 ruling 1): a title of at most 4 words, one line of at most 12 words
 * and one sentence, a tooltip of at most 3 lines. Pure: the budget test (#424) and a review read
 * the problems; the game never does.
 */
import { ONE_LINE_WORDS_MAX, TITLE_WORDS_MAX, TOOLTIP_LINES_MAX } from '../../constants/uiParts'
import type { UiText } from './uiText'

/** Whitespace-separated words; an icon-plus-value fact is not text and never counts. */
export function wordCountOf(text: string): number {
  return text.split(/\s+/).filter((word) => word !== '').length
}

/** Every way `text` breaks the budget; empty when it keeps it. */
export function uiTextProblemsOf(text: UiText): string[] {
  return [...titleProblemsOf(text), ...oneLineProblemsOf(text), ...tooltipProblemsOf(text)].map(
    (problem) => `${text.id}: ${problem}`,
  )
}

function titleProblemsOf(text: UiText): string[] {
  const words = wordCountOf(text.title)
  if (words === 0) return ['the title is empty']
  if (words > TITLE_WORDS_MAX) return [`the title has ${words} words, over ${TITLE_WORDS_MAX}`]
  return []
}

function oneLineProblemsOf(text: UiText): string[] {
  const words = wordCountOf(text.oneLine)
  const problems: string[] = []
  if (words > ONE_LINE_WORDS_MAX)
    problems.push(`the one line has ${words} words, over ${ONE_LINE_WORDS_MAX}`)
  if (sentenceCountOf(text.oneLine) > 1) problems.push('the one line is more than one sentence')
  return problems
}

function tooltipProblemsOf(text: UiText): string[] {
  const lines = text.tooltipLines.length
  if (lines > TOOLTIP_LINES_MAX)
    return [`the tooltip has ${lines} lines, over ${TOOLTIP_LINES_MAX}`]
  return []
}

/** Sentences end in `.`, `!` or `?` followed by a space and another word. */
function sentenceCountOf(line: string): number {
  return line.split(/[.!?]\s+(?=\S)/).length
}
