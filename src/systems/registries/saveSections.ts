/**
 * A slice's saved state (docs/standards/feature-slices.md 3.13, 5.3): each section carries its own
 * version, restored by exact match: refused, never migrated. Two slices changing their own
 * sections never touch a shared constant, and `SNAPSHOT_VERSION` is not bumped for one.
 */
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

export const SAVE_SECTION_REGISTRY = defineRegistry<SaveSection<unknown>>('saveSections')

/** The scope's sections, sorted by id. */
export function saveSectionsOf(scope: SaveSectionScope): readonly SaveSection<unknown>[] {
  return entriesOf(SAVE_SECTION_REGISTRY).filter((section) => section.scope === scope)
}
