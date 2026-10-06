/**
 * A slice's saved state (docs/standards/feature-slices.md 3.13, 5.3): each section carries its own
 * version, restored by exact match: refused, never migrated. Two slices changing their own
 * sections never touch a shared constant, and `SNAPSHOT_VERSION` is not bumped for one.
 *
 * The values live under `slices` on the authority state (session scope) or on each player (player
 * scope). A new state holds every registered section at its `initial`, so a snapshot always
 * carries them all; the key is omitted, never `undefined`, while the scope has no section, which
 * keeps every state digest of a build without sections unchanged.
 */
import type { AuthorityState, PlayerState } from '../authority/authorityState'
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

/** `{ slices }` holding each of the scope's sections at its `initial`; nothing when it has none. */
export function initialSectionsOf(scope: SaveSectionScope): { slices?: SliceSections } {
  const sections = saveSectionsOf(scope)
  if (sections.length === 0) return {}
  return { slices: Object.fromEntries(sections.map((section) => [section.id, section.initial])) }
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

/** The state with the section set to `value`. */
export function withSection<T>(
  state: AuthorityState,
  playerId: string | null,
  section: SaveSection<T>,
  value: T,
): AuthorityState {
  if (section.scope === 'session')
    return { ...state, slices: { ...state.slices, [section.id]: value } }
  const owner = ownerOf(playerId, section)
  const player = state.players[owner]
  const slices = { ...player.slices, [section.id]: value }
  return { ...state, players: { ...state.players, [owner]: { ...player, slices } } }
}

function sectionsHolderOf(
  state: AuthorityState,
  playerId: string | null,
  section: SaveSection<unknown>,
): AuthorityState | PlayerState {
  return section.scope === 'session' ? state : state.players[ownerOf(playerId, section)]
}

function ownerOf(playerId: string | null, section: SaveSection<unknown>): string {
  if (playerId === null) throw new Error(`player section "${section.id}" needs a player id`)
  return playerId
}
