/**
 * The slices' sections in the session snapshot (docs/standards/feature-slices.md 3.13, 5.3):
 * `{ [id]: { version, body } }` of every registered section under an optional `slices` key of the
 * portable state and of each portable player, omitted while the scope has no section. Restoring matches each section's version
 * exactly and refuses an unknown section: refused, never migrated. A registered section an older
 * snapshot lacks is restored at its initial value, with no migration step (#224, the #200 locks).
 */
import {
  isAtInitial,
  saveSectionsOf,
  slicesKeyOf,
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

/**
 * `{ slices }` to spread into a portable state or player: every registered section of the scope,
 * at its initial value when the state leaves it out; nothing while the scope has no section.
 */
export function portableSectionsOf(
  sections: SliceSections | undefined,
  scope: SaveSectionScope,
): { slices?: PortableSections } {
  const registered = saveSectionsOf(scope)
  if (registered.length === 0) return {}
  return {
    slices: Object.fromEntries(
      registered.map((section) => [section.id, portableSectionOf(section, sections)]),
    ),
  }
}

/**
 * `{ slices }` to spread into a restored state or player, leaving out each section at its initial
 * value as the state does. Call only on a portable without problems.
 */
export function sectionsOfPortable(
  portable: PortableSections | undefined,
  scope: SaveSectionScope,
): { slices?: SliceSections } {
  const values = saveSectionsOf(scope)
    .map((section) => [section, restoredValueOf(section, portable)] as const)
    .filter(([section, value]) => !isAtInitial(section, value))
  return slicesKeyOf(Object.fromEntries(values.map(([section, value]) => [section.id, value])))
}

/** The ids of the scope's registered sections `portable` lacks, which restore at initial. */
export function missingSectionIdsOf(
  portable: PortableSections | undefined,
  scope: SaveSectionScope,
): string[] {
  return saveSectionsOf(scope)
    .filter((section) => !isSectionIn(section, portable))
    .map((section) => section.id)
}

/** Every unknown, mismatched or malformed section under `<path>.slices`. */
export function portableSectionsProblems(
  portable: unknown,
  scope: SaveSectionScope,
  path: string,
): string[] {
  if (portable === undefined) return []
  if (!isJsonObject(portable)) return [`${path}.slices must be an object`]
  const registered = saveSectionsOf(scope)
  return Object.entries(portable).flatMap(([id, entry]) =>
    portableSectionProblems(registered, id, entry, `${path}.slices.${id}`),
  )
}

function restoredValueOf(section: SaveSection<unknown>, portable: PortableSections | undefined) {
  if (!isSectionIn(section, portable)) return section.initial
  return section.ofPortable(portable[section.id].body)
}

function isSectionIn(
  section: SaveSection<unknown>,
  portable: PortableSections | undefined,
): portable is PortableSections {
  return portable !== undefined && section.id in portable
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

function portableSectionOf(
  section: SaveSection<unknown>,
  sections: SliceSections | undefined,
): PortableSection {
  const value =
    sections !== undefined && section.id in sections ? sections[section.id] : section.initial
  return { version: section.version, body: section.toPortable(value) }
}
