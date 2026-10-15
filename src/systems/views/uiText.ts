/**
 * The text budget registry (spec #422 ruling 1, build #423): every shared Title+OneLine element
 * records the id, title, one line and tooltip lines it draws, so the budget test (#424) reads what
 * the screens show instead of guessing from markup. Newest text wins per id: a card's line changes
 * with its level, and the test judges the last drawing. Data only, never a rule the game reads.
 */

/** Where a line shows: on the element itself, or only in its brass tooltip. */
export type UiTextTag = 'visible' | 'tooltip'

/**
 * What a line carries that the player acts on (spec #422, Content's card mapping): these always
 * stay on the element, never in the tooltip, so the budget test (#424) refuses them there.
 */
export type UiTextHolds = 'price' | 'needs' | 'charges' | 'warning' | 'lock'

/** One line an element draws besides its title and one line, tagged where it shows (#424 Q2). */
export interface UiTextLine {
  readonly text: string
  readonly tag: UiTextTag
  readonly holds?: UiTextHolds
}

/** What an element is handed to draw: its title, one sentence and tooltip copy. */
export interface ElementText {
  /** The element's id, the `data-ui-text` hook the specs find it by. */
  readonly id: string
  /** At most `TITLE_WORDS_MAX` words. */
  readonly title: string
  /** One sentence of at most `ONE_LINE_WORDS_MAX` words; empty when the title stands alone. */
  readonly oneLine: string
  /** At most `TOOLTIP_LINES_MAX` short lines; empty when the element has no tooltip. */
  readonly tooltipLines: readonly string[]
}

/** What an element recorded: its text plus every other line it drew, each tagged (#424 Q2). */
export interface UiText extends ElementText {
  readonly lines: readonly UiTextLine[]
}

/** What a panel header adds under the title it already has (`Panel`'s `heading`). */
export type UiTextUnderTitle = Pick<ElementText, 'id' | 'oneLine' | 'tooltipLines'>

/** A visible fact as the registry sees it: its value, and what it holds when the caller says. */
export interface FactText {
  readonly text: string
  readonly holds?: UiTextHolds
}

/**
 * The lines the shared element draws besides its title and one line (#424 Q2): its facts and
 * its lock reason on the element, then its tooltip lines. A lock reason that names a prereq
 * ("Needs: …") holds the Needs line, any other holds the lock.
 */
export function elementLinesOf(
  text: ElementText,
  facts: readonly FactText[],
  lockReason: string | null,
): UiTextLine[] {
  return [
    ...facts.map(visibleFactLineOf),
    ...lockLinesOf(lockReason),
    ...text.tooltipLines.map(tooltipLineOf),
  ]
}

/** Whether a line names a prereq the player still needs (Content's `Needs: {prereq}`). */
export function isNeedsLine(text: string): boolean {
  return text.trimStart().startsWith('Needs:')
}

function visibleFactLineOf(fact: FactText): UiTextLine {
  if (fact.holds === undefined) return { text: fact.text, tag: 'visible' }
  return { text: fact.text, tag: 'visible', holds: fact.holds }
}

function lockLinesOf(lockReason: string | null): UiTextLine[] {
  if (lockReason === null) return []
  return [{ text: lockReason, tag: 'visible', holds: isNeedsLine(lockReason) ? 'needs' : 'lock' }]
}

function tooltipLineOf(text: string): UiTextLine {
  return { text, tag: 'tooltip' }
}

const recorded = new Map<string, UiText>()

/** Records what an element draws; drawing the same text again changes nothing. */
export function recordUiText(text: UiText): UiText {
  recorded.set(text.id, text)
  return text
}

/** Every text recorded since the last `forgetUiTexts`, sorted by id. */
export function registeredUiTexts(): readonly UiText[] {
  return [...recorded.values()].sort((a, b) => compareIds(a.id, b.id))
}

/** A spec's reset: the registry starts empty again. */
export function forgetUiTexts(): void {
  recorded.clear()
}

/** Code-unit order, never locale order, so every machine lists the same way. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
