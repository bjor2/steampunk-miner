/**
 * A tree node on the shared Title+OneLine element (spec #422, pass #426; Content's card mapping in
 * #422 comment 6197594891): the title is the node's name, the one line its card line when that
 * fits the budget, and the price, the Mark, any stacking note and why it is locked stay on the
 * element as glyph-and-value facts or the lock reason. A card line too long for one line, what the
 * node builds on, what it unlocks and its progression label sit in the brass tooltip, wrapped and
 * packed so no word is dropped. The map and the next-up strip draw compact chips (name and price,
 * the card line on hover); a lane's list and the card zoom draw the whole element. No line names a
 * planet but the lane list's own place on the ruler (Content's copy on #411).
 */
import {
  ONE_LINE_WORDS_MAX,
  TOOLTIP_LINE_WORDS_MAX,
  TOOLTIP_LINES_MAX,
} from '../../../constants/uiParts'
import {
  HINT_PLAQUE_ICON_ID,
  hudLabelIconIdOf,
  panelIconIdOf,
} from '../../../systems/art/icons/iconSet'
import type { ElementText } from '../../../systems/views/uiText'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import type { IconValue } from '../../../ui/kit/TitleOneLine'
import type { NodeCardModel } from '../systems/nodeCardModel'
import type { ProgressionLabel } from '../systems/techNode'

/** What the shared element draws for one node in one place on the screen. */
export interface NodeElement {
  readonly text: ElementText
  readonly facts: readonly IconValue[]
  /** Why the node cannot be researched, kept on the element; null when nothing stops it. */
  readonly lockReason: string | null
}

/** Where a chip sits: the same node may show on the map and in the next-up strip at once. */
export type ChipPlace = 'map' | 'next-up'

const JOIN = ' · '

const LABEL_TEXT: Readonly<Record<ProgressionLabel, string>> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  both: 'Vertical + horizontal',
}

/** A chip on the map or the next-up strip: name and price, its card line in the tooltip. */
export function nodeChipElementOf(card: NodeCardModel, place: ChipPlace): NodeElement {
  return {
    text: {
      id: `tech-tree.${place}.${card.id}`,
      title: card.name,
      oneLine: '',
      tooltipLines: wrappedLinesOf(card.description),
    },
    facts: priceFactsOf(card),
    lockReason: null,
  }
}

/** A row of one lane's list: its place on the ruler, price, Mark and notes; locked ones say why. */
export function nodeRowElementOf(card: NodeCardModel): NodeElement {
  return {
    text: { id: `tech-tree.lane.${card.id}`, ...cardLinesOf(card, []) },
    facts: [tierFactOf(card), ...priceFactsOf(card), ...markFactsOf(card), ...noteFactsOf(card)],
    lockReason: card.status === 'locked' ? card.refusalText : null,
  }
}

/** The card zoom: the row's lines plus what it builds on, unlocks and which way it grows. */
export function nodeCardElementOf(card: NodeCardModel): NodeElement {
  const pieces = [
    `Builds on: ${card.prereqText}`,
    `Unlocks: ${card.itemId}`,
    LABEL_TEXT[card.label],
  ]
  return {
    text: { id: `tech-tree.card.${card.id}`, ...cardLinesOf(card, pieces) },
    facts: [...priceFactsOf(card), ...noteFactsOf(card)],
    lockReason: card.refusalText,
  }
}

/** The card line as the one line when it fits, else wrapped first in the tooltip. */
function cardLinesOf(
  card: NodeCardModel,
  pieces: readonly string[],
): Pick<ElementText, 'title' | 'oneLine' | 'tooltipLines'> {
  const isOneLine = wordCountOf(card.description) <= ONE_LINE_WORDS_MAX
  const head = isOneLine ? [] : wrappedLinesOf(card.description)
  return {
    title: card.name,
    oneLine: isOneLine ? card.description : '',
    tooltipLines: [...head, ...packedPiecesOf(pieces, TOOLTIP_LINES_MAX - head.length)],
  }
}

/** A sentence over one tooltip line, split into even lines of at most the line's words. */
export function wrappedLinesOf(text: string): string[] {
  const tokens = text.split(/\s+/).filter((token) => token !== '')
  const lineCount = Math.ceil(tokens.length / TOOLTIP_LINE_WORDS_MAX)
  const perLine = Math.ceil(tokens.length / Math.max(1, lineCount))
  const lines: string[] = []
  for (let start = 0; start < tokens.length; start += perLine)
    lines.push(tokens.slice(start, start + perLine).join(' '))
  return lines
}

/** One piece per line while lines last, else joined while a line has words to spare. */
function packedPiecesOf(pieces: readonly string[], lineCount: number): string[] {
  if (pieces.length <= lineCount) return [...pieces]
  return pieces.reduce<string[]>((lines, piece) => appendPiece(lines, piece, lineCount), [])
}

/** Past the last line the rest joins it, so nothing is dropped and the budget test sees it. */
function appendPiece(lines: readonly string[], piece: string, lineCount: number): string[] {
  const last = lines.at(-1)
  if (last === undefined) return [piece]
  const joined = `${last}${JOIN}${piece}`
  const fits = wordCountOf(joined) <= TOOLTIP_LINE_WORDS_MAX
  if (lines.length < lineCount && !fits) return [...lines, piece]
  return [...lines.slice(0, -1), joined]
}

/** The price while it still applies; a researched node shows its rivet dot instead (#158). */
function priceFactsOf(card: NodeCardModel): IconValue[] {
  if (card.status === 'researched') return []
  const price: IconValue = {
    iconId: hudLabelIconIdOf('money'),
    text: card.costText,
    holds: 'price',
    isMoneyShort: card.status === 'available',
  }
  return [price]
}

function tierFactOf(card: NodeCardModel): IconValue {
  return { iconId: hudLabelIconIdOf('planet'), text: `P${card.tier}` }
}

/** The ladder chip ("Mk VII → VIII") that stands for every Mark of the item. */
function markFactsOf(card: NodeCardModel): IconValue[] {
  if (card.markChip === null) return []
  return [{ iconId: panelIconIdOf('upgrades'), text: card.markChip.text }]
}

/** A "Note: …" is a stacking warning: it stays on the element (Content's mapping, rule 3). */
function noteFactsOf(card: NodeCardModel): IconValue[] {
  return card.notes.map((note) => ({ iconId: HINT_PLAQUE_ICON_ID, text: note, holds: 'warning' }))
}
