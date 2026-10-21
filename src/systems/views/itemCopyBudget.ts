/**
 * Progression's copy audit (spec #678 GD lock, ticket 680): every item title data holds is at most
 * `TITLE_WORDS_MAX` words and every line its hover shows (the flavour, the card notes, the gate
 * note) at most `TOOLTIP_LINE_WORDS_MAX`, the `copy` budgets of the design tokens. The UI budget
 * test (#424) judges what the start scenario draws; this judges the data itself, so an item that
 * arrives on planet 90 is held to the same budget before any screen draws it. Pure.
 */
import { TITLE_WORDS_MAX, TOOLTIP_LINE_WORDS_MAX } from '../../constants/uiParts'
import type { ContentEntry, ContentRegistration } from '../registries/content'
import type { ItemDescription } from '../registries/itemDescriber'
import { wordCountOf } from './uiTextBudget'

/** One item's copy as data holds it: its title, when it carries one, and its hover lines. */
export interface ItemCopy {
  readonly id: string
  readonly title: string | null
  readonly hoverLines: readonly string[]
}

/** The copy fields a content entry may carry (tech nodes, combo templates, power-ups). */
interface CopyFields extends ContentEntry {
  readonly name?: unknown
  readonly description?: unknown
  readonly cardNotes?: unknown
}

/** Every way an item's copy breaks the budget; empty when it keeps it. */
export function itemCopyProblemsOf(copy: ItemCopy): string[] {
  return [...titleProblemsOf(copy.title), ...copy.hoverLines.flatMap(hoverLineProblemsOf)].map(
    (problem) => `${copy.id}: ${problem}`,
  )
}

/** A registered content entry's name, description and card notes. */
export function contentItemCopyOf({ kind, id, entry }: ContentRegistration): ItemCopy {
  const fields: CopyFields = entry
  return {
    id: `${kind}:${id}`,
    title: typeof fields.name === 'string' ? fields.name : null,
    hoverLines: [...stringsOf(fields.description), ...stringsOf(fields.cardNotes)],
  }
}

/** A card's flavour and gate note, the lines its tooltip opens with. */
export function describedItemCopyOf(id: string, description: ItemDescription): ItemCopy {
  return { id, title: null, hoverLines: stringsOf([description.flavour, description.gateNote]) }
}

function titleProblemsOf(title: string | null): string[] {
  if (title === null) return []
  const words = wordCountOf(title)
  if (words <= TITLE_WORDS_MAX) return []
  return [`the title "${title}" has ${words} words, over ${TITLE_WORDS_MAX}`]
}

function hoverLineProblemsOf(line: string): string[] {
  const words = wordCountOf(line)
  if (words <= TOOLTIP_LINE_WORDS_MAX) return []
  return [`the hover line "${line}" has ${words} words, over ${TOOLTIP_LINE_WORDS_MAX}`]
}

function stringsOf(value: unknown): string[] {
  const values: readonly unknown[] = Array.isArray(value) ? value : [value]
  return values.filter((text): text is string => typeof text === 'string')
}
