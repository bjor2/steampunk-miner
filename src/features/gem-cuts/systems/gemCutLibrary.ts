/**
 * The gem-cut library (ticket 889, ME of the GD's Materials Expansion lock of 25 Oct 2026): about
 * 24 cuts made in Blender and rendered neutral into the cells of the library's atlas pages, which
 * follow every act's own hero pages as hue-tinted pages (`render/heroAtlas.ts`), so one library
 * serves every generated planet and nothing is authored per planet. The library is append-only: a
 * cut keeps its place for good (its place is its cell), and `since` is the first ore rules version
 * a planet must be stamped with to draw it, never below the version before it, so a cut appended
 * later waits for the next ore rules version and the pick of a planet already generated never
 * moves (`gemCutPick.ts`). Read once from `gemCuts.json` and refused whole when broken.
 */
import { HERO_ATLAS_CELLS } from '../../../constants/scene'
import type { ArtAsset } from '../../../systems/registries/artAssets'
import type { HeroAtlasPage } from '../../../systems/render/heroAtlas'
import { GENERATED_POOLS_ORE_RULES } from '../../../systems/world/planetParams'
import cutsFile from '../gemCuts.json'

export interface GemCut {
  /** `gem-cut.<name>`, the id the atlas cell is keyed by. */
  id: string
  name: string
  /** The first ore rules version a planet draws it under. */
  since: number
  /** The stone the builder makes, for the README. */
  shape: string
}

export interface GemCutLibrary {
  /** In file order: a cut's place is its cell, so a cut is only ever appended. */
  cuts: readonly GemCut[]
}

export const GEM_CUT_ID_PREFIX = 'gem-cut.'
/** Page 1 keeps the bare id, page n gains `-page-<n>`, as the act atlases do (ticket 852). */
export const GEM_CUT_ATLAS_ASSET = 'ground-gem-cut-atlas'

type Raw = Record<string, unknown>

export const GEM_CUT_LIBRARY: GemCutLibrary = loadGemCutLibrary(cutsFile)

export function loadGemCutLibrary(raw: unknown): GemCutLibrary {
  const problems = gemCutLibraryProblems(raw)
  if (problems.length > 0) throw new Error(`gemCuts.json is refused:\n${problems.join('\n')}`)
  const file = raw as Raw
  return {
    cuts: (file.cuts as GemCut[]).map(({ id, name, since, shape }) => ({ id, name, since, shape })),
  }
}

/** The cuts a planet stamped with `oreRulesVersion` may draw, in library order. */
export function cutsUnder(
  oreRulesVersion: number | undefined,
  library: GemCutLibrary = GEM_CUT_LIBRARY,
): readonly GemCut[] {
  const stamp = oreRulesVersion ?? 0
  return library.cuts.filter((cut) => cut.since <= stamp)
}

/** The cut with `id`, or null. */
export function gemCutOf(id: string, library: GemCutLibrary = GEM_CUT_LIBRARY): GemCut | null {
  return library.cuts.find((cut) => cut.id === id) ?? null
}

/** The library's atlas pages, every one hue-tinted, 16 cuts a page in library order. */
export function gemCutPagesOf(library: GemCutLibrary = GEM_CUT_LIBRARY): HeroAtlasPage[] {
  const pageCount = Math.ceil(library.cuts.length / HERO_ATLAS_CELLS)
  return Array.from({ length: pageCount }, (_, at) => ({
    assetId: gemCutAtlasAssetIdOf(at + 1),
    cells: library.cuts
      .slice(at * HERO_ATLAS_CELLS, (at + 1) * HERO_ATLAS_CELLS)
      .map((cut) => cut.id),
    isHueTinted: true,
  }))
}

export function gemCutAtlasAssetIdOf(page: number): string {
  return page === 1 ? GEM_CUT_ATLAS_ASSET : `${GEM_CUT_ATLAS_ASSET}-page-${page}`
}

/** Every page's art, joining the kernel's #51 inventory (#214). */
export function gemCutArtAssets(library: GemCutLibrary = GEM_CUT_LIBRARY): ArtAsset[] {
  return gemCutPagesOf(library).map((page) => ({ id: page.assetId, category: 'ground' as const }))
}

/** Why a file is not a gem-cut library; empty when it may ship. */
export function gemCutLibraryProblems(raw: unknown): string[] {
  const file = (raw ?? {}) as Raw
  if (!Array.isArray(file.cuts) || file.cuts.length === 0) {
    return ['cuts must be a list of at least one cut']
  }
  const rows = file.cuts as Raw[]
  return [
    ...rows.flatMap(rowProblems),
    ...duplicateProblems(rows, 'id'),
    ...duplicateProblems(rows, 'name'),
    ...sinceOrderProblems(rows),
  ]
}

function rowProblems(row: Raw, at: number): string[] {
  const where = `cuts[${at}]`
  return [
    ...idProblems(row.id, where),
    ...(isWord(row.name) ? [] : [`${where}.name must be a word`]),
    ...(isWord(row.shape) ? [] : [`${where}.shape must say what the stone is`]),
    ...sinceProblems(row.since, where),
    ...Object.keys(row)
      .filter((field) => !['id', 'name', 'since', 'shape'].includes(field))
      .map((field) => `${where} has the unknown field ${field}`),
  ]
}

function idProblems(id: unknown, where: string): string[] {
  const isCutId = typeof id === 'string' && /^gem-cut\.[a-z][a-z0-9-]*$/.test(id)
  return isCutId ? [] : [`${where}.id must be gem-cut.<kebab-name>`]
}

function sinceProblems(since: unknown, where: string): string[] {
  const isVersion = Number.isInteger(since) && (since as number) >= GENERATED_POOLS_ORE_RULES
  return isVersion
    ? []
    : [`${where}.since must be an ore rules version from ${GENERATED_POOLS_ORE_RULES}`]
}

/** A cut's `since` never falls below the cut before it: appended cuts wait for a later version. */
function sinceOrderProblems(rows: Raw[]): string[] {
  return rows.flatMap((row, at) =>
    at > 0 && typeof row.since === 'number' && typeof rows[at - 1].since === 'number'
      ? row.since >= (rows[at - 1].since as number)
        ? []
        : [`cuts[${at}].since falls below the cut before it; a cut is only ever appended`]
      : [],
  )
}

function duplicateProblems(rows: Raw[], field: string): string[] {
  const values = rows.map((row) => row[field])
  return values
    .filter((value, at) => values.indexOf(value) !== at)
    .map((value) => `two cuts share the ${field} ${String(value)}`)
}

function isWord(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}
