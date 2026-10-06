/**
 * The asset manifest, the #51 inventory as data (#52 "Folders"), one `art/assets/<id>.json` entry
 * per asset (#116): every asset with its `source` (blender, vector, shader or procedural), its
 * `form` (what files it ships as) and its `status`. A `placeholder` has no files, and a Blender
 * placeholder carries the flat colour the renderer draws it in (`partColors` overrides it per
 * part). A `final` asset ships exactly the files its form names. The asset lint (#52 acceptance 1, #51 acceptance 1) is these rules run
 * over the shipped files.
 */
import { blenderAssetIds, categoryOfAssetId, isKebabId, vectorIconIds } from './artIds'

export const ASSET_SOURCES = ['blender', 'vector', 'shader', 'procedural'] as const

export type AssetSource = (typeof ASSET_SOURCES)[number]

/**
 * `parts`: KTX2 atlases plus a parts.json; `tile`: tileable albedo and normal maps (ground and
 * casing, #52); `backdrop`: a bay screen render (#51); `svg`: an icon under `src/ui/icons/`;
 * `css` and `code`: drawn by the UI kit or by shaders and particles, with no file of their own.
 */
export type AssetForm = 'parts' | 'tile' | 'backdrop' | 'svg' | 'css' | 'code'

export type AssetStatus = 'placeholder' | 'final'

export interface ManifestEntry {
  id: string
  source: AssetSource
  form: AssetForm
  status: AssetStatus
  color?: string
  partColors?: Readonly<Record<string, string>>
  /**
   * A tile whose material glows (#113: refractory seams, lava) ships an emissive map too. A tile has
   * no sidecar to say so, as a parts asset's does.
   */
  emissive?: boolean
}

/** Every entry file, sorted by id (`artCatalogueOf`). */
export interface AssetManifest {
  assets: readonly ManifestEntry[]
}

/** Folders whose every file must belong to a manifest entry (#52 acceptance 1). */
export const SHIPPED_ART_FOLDERS = ['public/assets/', 'src/ui/icons/'] as const

const FORMS_OF_SOURCE: Readonly<Record<AssetSource, readonly AssetForm[]>> = {
  blender: ['parts', 'tile', 'backdrop'],
  vector: ['svg', 'css'],
  shader: ['code'],
  procedural: ['code'],
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/

/** A tile's maps; the last ships only when the entry says the tile glows. */
const TILE_MAP_KINDS = ['albedo', 'normal', 'emissive'] as const

/** Why the manifest is not the #51 inventory under the #52 naming; empty when it is. */
export function manifestProblems(manifest: AssetManifest): string[] {
  return [
    ...duplicateIdProblems(manifest.assets),
    ...manifest.assets.flatMap(entryProblems),
    ...missingIdProblems(manifest.assets, 'blender', blenderAssetIds()),
    ...missingIdProblems(manifest.assets, 'vector', vectorIconIds()),
  ]
}

function entryProblems(entry: ManifestEntry): string[] {
  const problems: string[] = []
  if (!isKebabId(entry.id)) problems.push('id must be kebab-case')
  if (!(FORMS_OF_SOURCE[entry.source] ?? []).includes(entry.form)) {
    problems.push(`a ${entry.source} asset cannot have the form ${entry.form}`)
  }
  if (!isRegisteredId(entry)) problems.push('id is not derived from a registry id (#52)')
  if (isBlenderPlaceholder(entry) && !isHexColour(entry.color)) {
    problems.push('a Blender placeholder needs a #rrggbb color')
  }
  if (!Object.values(entry.partColors ?? {}).every(isHexColour)) {
    problems.push('partColors must be #rrggbb colours')
  }
  if (entry.emissive !== undefined && entry.form !== 'tile') {
    problems.push('only a tile says emissive; a parts sidecar names its own maps')
  }
  return problems.map((problem) => `asset "${entry.id}": ${problem}`)
}

function isRegisteredId(entry: ManifestEntry): boolean {
  if (entry.source === 'blender') return blenderAssetIds().includes(entry.id)
  if (entry.form === 'svg') return vectorIconIds().includes(entry.id)
  return true
}

function isBlenderPlaceholder(entry: ManifestEntry): boolean {
  return entry.source === 'blender' && entry.status === 'placeholder'
}

function isHexColour(colour: string | undefined): boolean {
  return colour !== undefined && HEX_COLOUR.test(colour)
}

function duplicateIdProblems(entries: readonly ManifestEntry[]): string[] {
  const ids = entries.map((entry) => entry.id)
  return ids.filter((id, at) => ids.indexOf(id) !== at).map((id) => `asset "${id}" is listed twice`)
}

function missingIdProblems(
  entries: readonly ManifestEntry[],
  source: AssetSource,
  expected: readonly string[],
): string[] {
  const listed = entries.filter((entry) => entry.source === source).map((entry) => entry.id)
  return expected
    .filter((id) => !listed.includes(id))
    .map((id) => `asset "${id}" from the #51 inventory is missing from the manifest`)
}

/**
 * Where a final asset's files live (#52 "Folders"). A `parts` asset lists its sidecar here; the
 * maps it ships are the ones the sidecar names (`mapFilesOf`), so an asset with nothing that glows
 * ships no emissive map.
 */
export function folderOfEntry(entry: ManifestEntry): string | null {
  if (entry.form === 'svg') return 'src/ui/icons/'
  const category = categoryOfAssetId(entry.id)
  if (entry.source !== 'blender' || category === null) return null
  return `public/assets/${category}/${entry.id}/`
}

/** The files a final entry ships, given the maps its sidecar names (`parts` form only). */
export function expectedFilesOf(entry: ManifestEntry, sidecarMaps: readonly string[]): string[] {
  const folder = folderOfEntry(entry)
  if (entry.status !== 'final' || folder === null) return []
  return namesOfForm(entry, sidecarMaps).map((name) => folder + name)
}

function namesOfForm(entry: ManifestEntry, sidecarMaps: readonly string[]): string[] {
  const { id } = entry
  if (entry.form === 'parts') return [`${id}.parts.json`, ...sidecarMaps]
  if (entry.form === 'tile') return tileMapNamesOf(entry)
  if (entry.form === 'backdrop') return [`${id}.albedo.ktx2`]
  return entry.form === 'svg' ? [`${id}.svg`] : []
}

function tileMapNamesOf(entry: ManifestEntry): string[] {
  const kinds = entry.emissive === true ? TILE_MAP_KINDS : TILE_MAP_KINDS.slice(0, 2)
  return kinds.map((kind) => `${entry.id}.${kind}.ktx2`)
}

/** The asset id a shipped file belongs to: its folder under public/assets, or its icon's stem. */
export function ownerIdOfFile(path: string): string | null {
  const exported = /^public\/assets\/[^/]+\/([^/]+)\/[^/]+$/.exec(path)
  if (exported !== null) return exported[1]
  const icon = /^src\/ui\/icons\/([^/]+)\.[^/.]+$/.exec(path)
  return icon === null ? null : icon[1]
}

/**
 * #52 acceptance 1 and #51 acceptance 1 and 3: every shipped art file belongs to a final manifest
 * entry and is one of the files its form names (so no raster icon), and no final entry misses a
 * file. `expectedFiles` is every final entry's `expectedFilesOf`; `shipped` are repo-relative paths.
 */
export function shippedFileProblems(
  manifest: AssetManifest,
  expectedFiles: readonly string[],
  shipped: readonly string[],
): string[] {
  return [
    ...shipped.flatMap((path) => strayFileProblems(manifest, expectedFiles, path)),
    ...expectedFiles.filter((path) => !shipped.includes(path)).map((path) => `${path}: missing`),
  ]
}

function strayFileProblems(
  manifest: AssetManifest,
  expectedFiles: readonly string[],
  path: string,
): string[] {
  const owner = manifest.assets.find((entry) => entry.id === ownerIdOfFile(path))
  if (owner === undefined) return [`${path}: has no art/assets entry`]
  if (owner.status !== 'final')
    return [`${path}: "${owner.id}" is a placeholder, which ships no files`]
  if (!expectedFiles.includes(path)) return [`${path}: is not a file a ${owner.form} asset ships`]
  return []
}
