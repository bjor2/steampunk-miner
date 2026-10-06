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
import { defineRegistry, entriesOf } from './seal'
import type { VehicleItem } from './vehicleLoadout'

export interface ContentEntry {
  id: string
  iconId: string
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

/** Every content entry's icon, for the kernel icon coverage test. */
export function contentIconIds(): readonly ContentIconUse[] {
  return entriesOf(CONTENT_REGISTRY).map(({ kind, id, entry }) => ({
    kind,
    id,
    iconId: entry.iconId,
  }))
}
