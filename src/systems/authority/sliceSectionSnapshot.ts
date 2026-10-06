/**
 * The slices' sections in the session snapshot (docs/standards/feature-slices.md 3.13, 5.3):
 * `{ [id]: { version, body } }` under an optional `slices` key of the portable state and of each
 * portable player, omitted while the state holds none. Restoring matches each section's version
 * exactly and refuses an unknown or a missing section: refused, never migrated.
 */
import {
  saveSectionsOf,
  type SaveSection,
  type SaveSectionScope,
  type SliceSections,
} from '../registries/saveSections'
import { isJsonObject, isWholeNumber } from './payloadFields'

export interface PortableSection {
  version: number
  body: unknown
}

export type PortableSections = Record<string, PortableSection>

/** `{ slices }` to spread into a portable state or player; nothing when the state holds none. */
export function portableSectionsOf(
  sections: SliceSections | undefined,
  scope: SaveSectionScope,
): { slices?: PortableSections } {
  if (sections === undefined) return {}
  return {
    slices: Object.fromEntries(
      Object.entries(sections).map(([id, value]) => {
        const section = registeredSectionOf(scope, id)
        return [id, { version: section.version, body: section.toPortable(value) }]
      }),
    ),
  }
}

/** `{ slices }` to spread into a restored state or player; call only on a portable without problems. */
export function sectionsOfPortable(
  portable: PortableSections | undefined,
  scope: SaveSectionScope,
): { slices?: SliceSections } {
  if (portable === undefined) return {}
  return {
    slices: Object.fromEntries(
      Object.entries(portable).map(([id, entry]) => [
        id,
        registeredSectionOf(scope, id).ofPortable(entry.body),
      ]),
    ),
  }
}

/** Every unknown, missing, mismatched or malformed section under `<path>.slices`. */
export function portableSectionsProblems(
  portable: unknown,
  scope: SaveSectionScope,
  path: string,
): string[] {
  const registered = saveSectionsOf(scope)
  if (portable === undefined) return missingSectionProblems(registered, {}, path)
  if (!isJsonObject(portable)) return [`${path}.slices must be an object`]
  return [
    ...Object.entries(portable).flatMap(([id, entry]) =>
      portableSectionProblems(registered, id, entry, `${path}.slices.${id}`),
    ),
    ...missingSectionProblems(registered, portable, path),
  ]
}

function portableSectionProblems(
  registered: readonly SaveSection<unknown>[],
  id: string,
  entry: unknown,
  path: string,
): string[] {
  const section = registered.find((known) => known.id === id)
  if (section === undefined) return [`${path} is a section this build does not register`]
  if (!isJsonObject(entry) || !isWholeNumber(entry.version) || !('body' in entry))
    return [`${path} must hold a whole version and a body`]
  if (entry.version !== section.version)
    return [`${path}.version is ${entry.version}, this build reads ${section.version}`]
  return section.problems(entry.body).map((problem) => `${path}.body: ${problem}`)
}

function missingSectionProblems(
  registered: readonly SaveSection<unknown>[],
  portable: Record<string, unknown>,
  path: string,
): string[] {
  return registered
    .filter((section) => !(section.id in portable))
    .map((section) => `${path}.slices.${section.id} is missing: this build registers it`)
}

/** A state only ever holds registered sections, so an unknown id here is a bug, not a save. */
function registeredSectionOf(scope: SaveSectionScope, id: string): SaveSection<unknown> {
  const section = saveSectionsOf(scope).find((known) => known.id === id)
  if (section === undefined) throw new Error(`no ${scope} save section "${id}" is registered`)
  return section
}
