/**
 * Item card lines contributed as data (Horizontal Scaler's amendment on #164, K7 #199): a feature
 * slice files one entry in its own `register.ts` for the items it adds, and the one describer
 * provider (the `descriptions` slice) turns it into text, so the card keeps one voice. Append-only,
 * many contributors, sorted by id.
 *
 * An entry matches refs by kind, and by an exact id or an id prefix. Two entries that could match
 * the same ref are refused at seal time, so which entry answers never depends on order. A stat line
 * spec returns the raw value from a kernel or owner-slice stat function; it never formats.
 */
import type { TrackKind } from '../economy/trackKind'
import type { Money } from '../money'
import type { ItemCtx, ItemKind, ItemRef } from './itemDescriber'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export interface ItemMatch {
  kind: ItemKind
  id?: string
  idPrefix?: string
}

export interface StatLineSpec {
  label: string
  /** How the stat grows, from the owner's stat function (`trackKindOf` for the kernel tracks). */
  kind: TrackKind
  value(ref: ItemRef, ctx: ItemCtx): number | Money
}

export interface ItemDescriptionEntry {
  /** `<slice>.<name>`, such as `tech-tree.mark`. */
  id: string
  matches: ItemMatch
  /** Plain text, no markup; written once per entry or family, never per level. */
  flavour: string | ((ref: ItemRef) => string)
  statLines: readonly StatLineSpec[]
  /** The generated refs this entry's items reach by this planet (Marks, combos, sizes). */
  refs?(planetIndex: number): readonly ItemRef[]
}

export const ITEM_DESCRIPTION_ENTRY_REGISTRY = defineRegistry<ItemDescriptionEntry>(
  'itemDescriptionEntries',
  overlappingMatchProblemOf,
)

/** The one entry that matches the ref, or null. */
export function itemDescriptionEntryOf(ref: ItemRef): ItemDescriptionEntry | null {
  return (
    entriesOf(ITEM_DESCRIPTION_ENTRY_REGISTRY).find((e) => isRefMatched(e.matches, ref)) ?? null
  )
}

/** Every entry's generated refs for one planet, in entry id order. */
export function generatedItemRefsOn(planetIndex: number): readonly ItemRef[] {
  return entriesOf(ITEM_DESCRIPTION_ENTRY_REGISTRY).flatMap(
    (entry) => entry.refs?.(planetIndex) ?? [],
  )
}

export function isRefMatched(match: ItemMatch, ref: ItemRef): boolean {
  return match.kind === ref.kind && isIdMatched(match, ref.id)
}

function isIdMatched(match: ItemMatch, id: string): boolean {
  const isExactIdMet = match.id === undefined || match.id === id
  return isExactIdMet && id.startsWith(match.idPrefix ?? '')
}

function overlappingMatchProblemOf(
  registrations: readonly SealedRegistration<ItemDescriptionEntry>[],
): string | null {
  const pair = firstOverlappingPairOf(registrations)
  if (pair === null) return null
  const [a, b] = pair.map(({ sliceId, entry }) => `"${entry.id}" (slice "${sliceId}")`)
  return `entries ${a} and ${b} can match the same ref`
}

function firstOverlappingPairOf<T extends SealedRegistration<ItemDescriptionEntry>>(
  registrations: readonly T[],
): readonly [T, T] | null {
  for (let i = 0; i < registrations.length; i++) {
    const partner = registrations
      .slice(i + 1)
      .find((other) => canMatchSameRef(registrations[i].entry.matches, other.entry.matches))
    if (partner !== undefined) return [registrations[i], partner]
  }
  return null
}

/** Whether some ref satisfies both matches: one shared exact id, or compatible prefixes. */
function canMatchSameRef(a: ItemMatch, b: ItemMatch): boolean {
  if (a.kind !== b.kind) return false
  const id = a.id ?? b.id
  if (id !== undefined) return isIdMatched(a, id) && isIdMatched(b, id)
  return arePrefixesCompatible(a.idPrefix ?? '', b.idPrefix ?? '')
}

function arePrefixesCompatible(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a)
}
