/**
 * The text budget (spec #422 ruling 1): a title of at most 4 words, one line of at most 12 words
 * and one sentence, a tooltip of at most 3 lines of at most 12 words. Those are budget breaches a
 * panel's allowlist entry may cover while its pass trims it (#424). The tag rules are not: a line
 * holding a price, a Needs line, charges, a warning or a lock reason never sits in the tooltip, and
 * a visible fact line is at most 12 words (GD on #424). Pure: the budget test and a review read the
 * problems; the game never does.
 */
import {
  FACT_LINE_WORDS_MAX,
  ONE_LINE_WORDS_MAX,
  TITLE_WORDS_MAX,
  TOOLTIP_LINE_WORDS_MAX,
  TOOLTIP_LINES_MAX,
} from '../../constants/uiParts'
import type { UiBudgetRule } from '../../constants/uiBudgetAllowlist'
import { isNeedsLine, type UiText, type UiTextLine } from './uiText'

/** One way an element breaks the budget, under the rule an allowlist entry counts it by. */
export interface UiBudgetBreach {
  readonly rule: UiBudgetRule
  readonly message: string
}

/**
 * A number or compact Money is icon plus value, never words (TD ruling on #424 Q1): `1.2e149`,
 * `1,234`, `12m`, `0.41%`, `1.00e-7%`. The ruling's pattern, with the signed exponent
 * `formatPercent` prints.
 */
const NUMBER_TOKEN = /^[+−-]?\d[\d.,]*(e[+-]?\d+)?[a-zA-Z%]{0,3}$/
/** What may wrap a number in a sentence without making it a word: `(×1.12)`, `<0.01%,`. */
const NUMBER_WRAPPING = /^[(×<~≈]+|[).,;:!?]+$/g
const LETTER = /\p{L}/u

/** Words a reader reads: a token with a letter in it that is not a number with its unit. */
export function wordCountOf(text: string): number {
  return text.split(/\s+/).filter(isWord).length
}

/** Every budget breach of an element, each under its rule; empty when it keeps the budget. */
export function uiTextBreachesOf(text: UiText): UiBudgetBreach[] {
  return [...titleBreachesOf(text), ...oneLineBreachesOf(text), ...tooltipBreachesOf(text)].map(
    (breach) => ({ rule: breach.rule, message: `${text.id}: ${breach.message}` }),
  )
}

/** Every tag rule an element breaks; never allowlistable (TD ruling on #424 Q2). */
export function uiTextTagProblemsOf(text: UiText): string[] {
  return text.lines.flatMap(lineTagProblemsOf).map((problem) => `${text.id}: ${problem}`)
}

/** Every way `text` breaks the budget or a tag rule; empty when it keeps both. */
export function uiTextProblemsOf(text: UiText): string[] {
  return [...uiTextBreachesOf(text).map((breach) => breach.message), ...uiTextTagProblemsOf(text)]
}

function isWord(token: string): boolean {
  return LETTER.test(token) && !NUMBER_TOKEN.test(token.replace(NUMBER_WRAPPING, ''))
}

function titleBreachesOf(text: UiText): UiBudgetBreach[] {
  const words = wordCountOf(text.title)
  if (words === 0) return [{ rule: 'title', message: 'the title is empty' }]
  if (words > TITLE_WORDS_MAX)
    return [{ rule: 'title', message: `the title has ${words} words, over ${TITLE_WORDS_MAX}` }]
  return []
}

function oneLineBreachesOf(text: UiText): UiBudgetBreach[] {
  const words = wordCountOf(text.oneLine)
  const breaches: UiBudgetBreach[] = []
  if (words > ONE_LINE_WORDS_MAX)
    breaches.push({
      rule: 'oneLine',
      message: `the one line has ${words} words, over ${ONE_LINE_WORDS_MAX}`,
    })
  if (sentenceCountOf(text.oneLine) > 1)
    breaches.push({ rule: 'oneLine', message: 'the one line is more than one sentence' })
  return breaches
}

function tooltipBreachesOf(text: UiText): UiBudgetBreach[] {
  const lines = text.lines.filter((line) => line.tag === 'tooltip')
  return [...tooltipCountBreachesOf(lines.length), ...lines.flatMap(tooltipLineBreachesOf)]
}

function tooltipCountBreachesOf(count: number): UiBudgetBreach[] {
  if (count <= TOOLTIP_LINES_MAX) return []
  return [{ rule: 'tooltip', message: `the tooltip has ${count} lines, over ${TOOLTIP_LINES_MAX}` }]
}

function tooltipLineBreachesOf(line: UiTextLine): UiBudgetBreach[] {
  const words = wordCountOf(line.text)
  if (words <= TOOLTIP_LINE_WORDS_MAX) return []
  const message = `the tooltip line "${line.text}" has ${words} words, over ${TOOLTIP_LINE_WORDS_MAX}`
  return [{ rule: 'tooltip', message }]
}

function lineTagProblemsOf(line: UiTextLine): string[] {
  return [...heldInTooltipProblemsOf(line), ...untaggedNeedsProblemsOf(line), ...factWordsOf(line)]
}

/** Price, Needs, charges, warnings and lock reasons always stay on the element (GD on #424). */
function heldInTooltipProblemsOf(line: UiTextLine): string[] {
  if (line.holds === undefined || line.tag !== 'tooltip') return []
  return [`the ${line.holds} line "${line.text}" is in the tooltip; it stays on the element`]
}

/** A forgotten tag never hides a Needs line (TD ruling on #424 Q2). */
function untaggedNeedsProblemsOf(line: UiTextLine): string[] {
  if (!isNeedsLine(line.text) || line.holds === 'needs') return []
  return [`the line "${line.text}" names a Needs prereq but does not hold 'needs'`]
}

/** A lock reason and every other visible fact fit 12 words; the rest is a tooltip line. */
function factWordsOf(line: UiTextLine): string[] {
  const words = wordCountOf(line.text)
  if (line.holds === undefined || words <= FACT_LINE_WORDS_MAX) return []
  return [`the ${line.holds} line "${line.text}" has ${words} words, over ${FACT_LINE_WORDS_MAX}`]
}

/** Sentences end in `.`, `!` or `?` followed by a space and another word. */
function sentenceCountOf(line: string): number {
  return line.split(/[.!?]\s+(?=\S)/).length
}
