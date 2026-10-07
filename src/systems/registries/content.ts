/**
 * Content entries slices register by kind (docs/standards/feature-slices.md 3.4): tech nodes,
 * dynamite sizes, vehicle items. Every entry has an `iconId`, which the kernel icon coverage test
 * resolves. A kind is declared by its owner through module augmentation:
 *
 *   declare module '<path to>/systems/registries/content' {
 *     interface ContentKinds { 'tech-node': TechNode }
 *   }
 *
 * Other slices register entries of that kind and import its type from the owner's `index.ts`.
 */
import { defineRegistry, entriesOf, registrationsOf } from './seal'
import type { VehicleItem } from './vehicleLoadout'

export interface ContentEntry {
  id: string
  iconId: string
  /**
   * The row of the locked horizontal schedule (docs/scaling/horizontal/stats.json) this entry
   * ships, when it ships one; the schedule coverage spec gives every row exactly one home.
   */
  scheduleRowId?: string
}

/** Kinds are added by module augmentation from the kind's owner; values must extend ContentEntry. */
export interface ContentKinds {
  'vehicle-item': VehicleItem
}

export type ContentKind = keyof ContentKinds

/** One registered entry, filed under its kind; the registry id is the entry's id. */
export interface ContentRegistration {
  id: string
  kind: string
  entry: ContentEntry
}

export interface ScheduleRowClaim {
  rowId: string
  entryId: string
  /** The slice that registered the entry, so it ships the row (the #191 horizontal test guard). */
  sliceId: string
}

export interface ContentIconUse {
  kind: string
  id: string
  iconId: string
}

export const CONTENT_REGISTRY = defineRegistry<ContentRegistration>('content')

export function contentRegistrationOf<K extends ContentKind>(
  kind: K,
  entry: ContentKinds[K],
): ContentRegistration {
  return { id: entry.id, kind, entry }
}

/** The kind's entries, sorted by id. */
export function contentOf<K extends ContentKind>(kind: K): readonly ContentKinds[K][] {
  return entriesOf(CONTENT_REGISTRY)
    .filter((registration) => registration.kind === kind)
    .map((registration) => registration.entry as ContentKinds[K])
}

/** Every schedule row a content entry claims, with the entry that claims it. */
export function contentScheduleRowClaims(): readonly ScheduleRowClaim[] {
  return registrationsOf(CONTENT_REGISTRY).flatMap(({ sliceId, entry: { id, entry } }) =>
    entry.scheduleRowId === undefined ? [] : [{ rowId: entry.scheduleRowId, entryId: id, sliceId }],
  )
}

/** Every content entry's icon, for the kernel icon coverage test. */
export function contentIconIds(): readonly ContentIconUse[] {
  return entriesOf(CONTENT_REGISTRY).map(({ kind, id, entry }) => ({
    kind,
    id,
    iconId: entry.iconId,
  }))
}
