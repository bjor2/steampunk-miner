/**
 * The kernel item card on the shared Title+OneLine element (spec #422, Content's card mapping in
 * its comment 6197594891; pass #425): the title is the buyable's name, the one line is its first
 * stat line with the change it buys, and the tooltip holds the rest in Content's order: the
 * flavour, then the caveats (the next major or the cap, then every other stat line), then the
 * source line. Nothing is dropped: past the tooltip's last line the rest joins that line, so the
 * budget test (#424) flags a card that needs Content's merge instead of hiding its text. The price
 * stays on the element as a fact, never here, and so does an unlock line that names a prereq
 * ("Needs: …"): it is the element's lock reason. Pure.
 */
import { TOOLTIP_LINES_MAX } from '../../constants/uiParts'
import type { ItemCardModel } from './itemCardModel'
import { itemCardTextOf, type ItemCardLineText } from './itemCardText'
import { isNeedsLine, type ElementText } from './uiText'

/** What the shared element draws for a card, besides the price fact the screen adds. */
export interface ItemCardElement {
  readonly text: ElementText
  /** The card's "Needs: …" unlock line, kept on the element; null when it names no prereq. */
  readonly lockReason: string | null
}

const JOIN = ' · '

/** The card on the shared element, its text recorded under `id`. */
export function itemCardElementOf(id: string, card: ItemCardModel): ItemCardElement {
  if (card.description === null) return { text: bareTextOf(id, card), lockReason: null }
  const text = itemCardTextOf(card.description)
  const needs = needsLineOf(text.unlock)
  const [first, ...rest] = text.lines
  const tooltipLines = packedTooltipLinesOf([
    text.flavour,
    ...asidesOf(first),
    ...rest.map(fullLineTextOf),
    text.gateNote,
    needs === null ? text.unlock : null,
  ])
  const oneLine = first === undefined ? '' : statLineTextOf(first)
  return { text: { id, title: card.name, oneLine, tooltipLines }, lockReason: needs }
}

/** "Drill power 1.5 → 1.509 +0.009 (+0.631%)": the stat, its next value and the change. */
export function statLineTextOf(line: ItemCardLineText): string {
  const next = line.next === null ? '' : ` → ${line.next}`
  const change = line.change === null ? '' : ` ${line.change}`
  return `${line.label} ${line.now}${next}${change}`
}

function bareTextOf(id: string, card: ItemCardModel): ElementText {
  return { id, title: card.name, oneLine: '', tooltipLines: [] }
}

function needsLineOf(unlock: string | null): string | null {
  return unlock !== null && isNeedsLine(unlock) ? unlock : null
}

function fullLineTextOf(line: ItemCardLineText): string {
  return [statLineTextOf(line), ...asidesOf(line)].join(JOIN)
}

function asidesOf(line: ItemCardLineText | undefined): string[] {
  if (line === undefined) return []
  return [line.major, line.cap].filter(isShown)
}

/** At most `TOOLTIP_LINES_MAX` lines, the overflow joined onto the last so no text is lost. */
function packedTooltipLinesOf(candidates: readonly (string | null)[]): string[] {
  const lines = candidates.filter(isShown)
  if (lines.length <= TOOLTIP_LINES_MAX) return lines
  const kept = lines.slice(0, TOOLTIP_LINES_MAX - 1)
  return [...kept, lines.slice(TOOLTIP_LINES_MAX - 1).join(JOIN)]
}

function isShown(text: string | null): text is string {
  return text !== null && text !== ''
}
