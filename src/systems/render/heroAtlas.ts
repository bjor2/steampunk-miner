/**
 * The per-act hero atlas (ticket 451; TD shape 6226270701 "#451 shape", GD ruling 6226278574
 * item 2): the hero species of an act drawn from one albedo-only KTX2 of 16 cells instead of
 * their procedural look. One atlas is resident at a time and it swaps only when the act changes,
 * so the slice hands the same atlas object to every planet of an act. A hero with no cell in the
 * resident atlas, or a GPU that cannot sample it, draws the shader look. Look only: no price,
 * gate or income reads it.
 */
import { HERO_ATLAS_CELLS } from '../../constants/scene'
import { manifestEntryOf, type ArtCatalogue } from '../art/artCatalogue'
import { folderOfEntry } from '../art/assetManifest'

/** One act's atlas as the slice names it. */
export interface HeroAtlasCells {
  /** The act; the resident atlas swaps only when this changes. */
  id: string
  /** Its `atlas` asset under `public/assets/ground/`. */
  assetId: string
  /** The species of each cell, cell 0 first (column `i mod 4`, row `i div 4`). */
  cells: readonly string[]
}

/** An atlas whose map ships: what the terrain loads, its URL relative to the page. */
export interface DrawnHeroAtlas {
  id: string
  albedo: string
  cells: readonly string[]
}

const PUBLIC_FOLDER = 'public/'

/** Null while the act has no atlas or its asset is not final: every hero draws the shader look. */
export function drawnHeroAtlasOf(
  atlas: HeroAtlasCells | null,
  art: ArtCatalogue,
): DrawnHeroAtlas | null {
  if (atlas === null) return null
  const albedo = atlasAlbedoMapOf(art, atlas.assetId)
  return albedo === null ? null : { id: atlas.id, albedo, cells: atlas.cells }
}

/** The albedo map of a final `atlas` asset, or null. */
export function atlasAlbedoMapOf(art: ArtCatalogue, assetId: string): string | null {
  const entry = manifestEntryOf(art, assetId)
  if (entry?.form !== 'atlas' || entry.status !== 'final') return null
  const folder = folderOfEntry(entry)?.slice(PUBLIC_FOLDER.length) ?? ''
  return `${folder}${entry.id}.albedo.ktx2`
}

/** Each species' cell, for the look table (`kindLookTable.ts`). */
export function heroCellsOf(cells: readonly string[]): Map<string, number> {
  return new Map(cells.map((speciesId, cell) => [speciesId, cell]))
}

/** Why an atlas cannot be packed into one 16-cell atlas; empty when it can. */
export function heroAtlasProblems(atlas: HeroAtlasCells): string[] {
  const repeated = atlas.cells.filter((id, at) => atlas.cells.indexOf(id) !== at)
  return [
    ...(atlas.cells.length <= HERO_ATLAS_CELLS
      ? []
      : [`${atlas.id} packs ${atlas.cells.length} heroes, over the ${HERO_ATLAS_CELLS} cells`]),
    ...repeated.map((id) => `${atlas.id} packs ${id} twice`),
  ]
}

/** Block-compressed formats store a 4 x 4 block at the least, so a level is never under 16 texels. */
const BLOCK_SIDE = 4

/** The GPU bytes a square atlas of `levels` mip levels holds at `bytesPerTexel`. */
export function residentBytesOf(sidePx: number, levels: number, bytesPerTexel: number): number {
  let bytes = 0
  for (let level = 0; level < levels; level++) {
    const side = Math.max(BLOCK_SIDE, sidePx >> level)
    bytes += side * side * bytesPerTexel
  }
  return bytes
}
