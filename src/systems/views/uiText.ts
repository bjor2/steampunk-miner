/**
 * The text budget registry (spec #422 ruling 1, build #423): every shared Title+OneLine element
 * records the id, title, one line and tooltip lines it draws, so the budget test (#424) reads what
 * the screens show instead of guessing from markup. Newest text wins per id: a card's line changes
 * with its level, and the test judges the last drawing. Data only, never a rule the game reads.
 */

export interface UiText {
  /** The element's id, the `data-ui-text` hook the specs find it by. */
  readonly id: string
  /** At most `TITLE_WORDS_MAX` words. */
  readonly title: string
  /** One sentence of at most `ONE_LINE_WORDS_MAX` words; empty when the title stands alone. */
  readonly oneLine: string
  /** At most `TOOLTIP_LINES_MAX` short lines; empty when the element has no tooltip. */
  readonly tooltipLines: readonly string[]
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
