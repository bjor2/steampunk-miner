/**
 * The kernel item card on the shared Title+OneLine element (spec #422, Content's card mapping in
 * its comment 6197594891; pass #425): the title is the buyable's name, the one line is its first
 * stat line with the change it buys, and the tooltip holds the rest in Content's order: the
 * flavour, then the caveats (the next major or the cap, then every other stat line), then the
 * source line. The caveats use the compact words of the GD ruling on #425 ("major in 10: 1.03, cap
 * 14 (57.1% to go)"), one piece per line while lines last; a card with more pieces than lines
 * packs them by words, and past the last line the rest joins it, so nothing is dropped and the
 * budget test (#424) flags a card that still needs Content's merge. The price stays on the element
 * as a fact, never here, and so does an unlock line that names a prereq ("Needs: …"): it is the
 * element's lock reason. Pure.
 */
import { TOOLTIP_LINE_WORDS_MAX, TOOLTIP_LINES_MAX } from '../../constants/uiParts'
import type { ItemCardModel } from './itemCardModel'
import { itemCardTextOf, type ItemCardLineText } from './itemCardText'
import { isNeedsLine, type ElementText } from './uiText'
import { wordCountOf } from './uiTextBudget'

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
  const tooltipLines = tooltipLinesOf(text.flavour, [
    firstCaveatOf(first),
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

/** "Acceleration 1 → 1.001 +0.001 (+0.177%), major in 10: 1.03, cap 1.8 (44.4% to go)". */
function fullLineTextOf(line: ItemCardLineText): string {
  return line.caveat === null ? statLineTextOf(line) : `${statLineTextOf(line)}, ${line.caveat}`
}

/** The one line's own caveat, opening its tooltip line: "Major in 10: 1.68". */
function firstCaveatOf(line: ItemCardLineText | undefined): string | null {
  const caveat = line?.caveat ?? null
  return caveat === null ? null : `${caveat[0].toUpperCase()}${caveat.slice(1)}`
}

/** The flavour on its own line, then the pieces in the lines left. */
function tooltipLinesOf(flavour: string, pieces: readonly (string | null)[]): string[] {
  const head = [flavour].filter(isShown)
  return [...head, ...packedPiecesOf(pieces.filter(isShown), TOOLTIP_LINES_MAX - head.length)]
}

/** One piece per line while lines last, else packed by words with the overflow on the last. */
function packedPiecesOf(pieces: readonly string[], lineCount: number): string[] {
  if (pieces.length <= lineCount) return [...pieces]
  return pieces.reduce<string[]>((lines, piece) => appendPiece(lines, piece, lineCount), [])
}

function appendPiece(lines: readonly string[], piece: string, lineCount: number): string[] {
  const last = lines.at(-1)
  if (last === undefined) return [piece]
  const joined = `${last}${JOIN}${piece}`
  if (lines.length < lineCount && !fitsOneTooltipLine(joined)) return [...lines, piece]
  return [...lines.slice(0, -1), joined]
}

function fitsOneTooltipLine(text: string): boolean {
  return wordCountOf(text) <= TOOLTIP_LINE_WORDS_MAX
}

function isShown(text: string | null): text is string {
  return text !== null && text !== ''
}
