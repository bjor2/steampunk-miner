/**
 * A slice's saved state (docs/standards/feature-slices.md 3.13, 5.3): each section carries its own
 * version, restored by exact match: refused, never migrated. Two slices changing their own
 * sections never touch a shared constant, and `SNAPSHOT_VERSION` is not bumped for one.
 *
 * The values live under `slices` on the authority state (session scope) or on each player (player
 * scope), and only while they differ from the section's `initial`: absent means initial. So a new
 * state never reads this registry (the store builds one at import, before `loadFeatures()`), a
 * registered section changes no state digest until a slice writes it, and the key is omitted,
 * never `undefined`, while it would be empty.
 */
import type { AuthorityState } from '../authority/authorityState'
import { toCanonicalJson } from '../authority/canonicalJson'
import { defineRegistry, entriesOf } from './seal'

export type SaveSectionScope = 'session' | 'player'

export interface SaveSection<T> {
  /** `<slice>` or `<slice>.<name>`. */
  id: string
  /** Exact match on restore. */
  version: number
  scope: SaveSectionScope
  initial: T
  problems(body: unknown): string[]
  /** Integers, strings, booleans, null and canonical Money strings only. */
  toPortable(value: T): unknown
  ofPortable(body: unknown): T
}

/**
 * Section values by section id. Each goes into the state digest as it is, so like the rest of the
 * authority state it holds only safe integers, booleans, strings, null and Money.
 */
export type SliceSections = Readonly<Record<string, unknown>>

export const SAVE_SECTION_REGISTRY = defineRegistry<SaveSection<unknown>>('saveSections')

/** The scope's sections, sorted by id. */
export function saveSectionsOf(scope: SaveSectionScope): readonly SaveSection<unknown>[] {
  return entriesOf(SAVE_SECTION_REGISTRY).filter((section) => section.scope === scope)
}

/** The section's value: the state's, else its `initial`. `playerId` names a player section's owner. */
export function readSection<T>(
  state: AuthorityState,
  playerId: string | null,
  section: SaveSection<T>,
): T {
  const sections = sectionsHolderOf(state, playerId, section).slices
  if (sections === undefined || !(section.id in sections)) return section.initial
  return sections[section.id] as T
}

/** The state with the section set to `value`; at its initial value the section is left out. */
export function withSection<T>(
  state: AuthorityState,
  playerId: string | null,
  section: SaveSection<T>,
  value: T,
): AuthorityState {
  if (section.scope === 'session') return withSlicesSet(state, section, value)
  const owner = ownerOf(playerId, section)
  const player = withSlicesSet(state.players[owner], section, value)
  return { ...state, players: { ...state.players, [owner]: player } }
}

/** Whether `value` is the section's initial value, compared in canonical portable form. */
export function isAtInitial<T>(section: SaveSection<T>, value: T): boolean {
  const portable = toCanonicalJson(section.toPortable(value))
  return portable === toCanonicalJson(section.toPortable(section.initial))
}

/** `{ slices }` to spread into a state or player; nothing when `sections` is empty. */
export function slicesKeyOf(sections: SliceSections): { slices?: SliceSections } {
  return Object.keys(sections).length === 0 ? {} : { slices: sections }
}

function withSlicesSet<H extends SectionsHolder, T>(
  holder: H,
  section: SaveSection<T>,
  value: T,
): H {
  const { slices: _replaced, ...rest } = holder
  const { [section.id]: _previous, ...others } = holder.slices ?? {}
  const sections = isAtInitial(section, value) ? others : { ...others, [section.id]: value }
  return { ...rest, ...slicesKeyOf(sections) } as H
}

interface SectionsHolder {
  slices?: SliceSections
}

function sectionsHolderOf(
  state: AuthorityState,
  playerId: string | null,
  section: SaveSection<unknown>,
): SectionsHolder {
  return section.scope === 'session' ? state : state.players[ownerOf(playerId, section)]
}

function ownerOf(playerId: string | null, section: SaveSection<unknown>): string {
  if (playerId === null) throw new Error(`player section "${section.id}" needs a player id`)
  return playerId
}
