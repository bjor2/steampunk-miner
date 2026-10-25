/**
 * The per-act hero atlas (ticket 451; TD shape 6226270701 "#451 shape", GD ruling 6226278574
 * item 2): the hero species of an act drawn from albedo-only KTX2 pages of 16 cells instead of
 * their procedural look. Pages are unbounded (ticket 852, HS ruling (a) of 24 Oct): a hero's skin
 * row records its page, and a hero with none goes to the first page with room, a new page opening
 * when the last is full, so a page never moves once its art ships. Every page of the act is
 * resident together, one layer each of one array texture on the same unit, and the set swaps only
 * when the act changes, so the cost scales per act and never per planet; the slice hands the same
 * atlas object to every planet of an act. A hero with no cell in the resident pages, or a GPU that
 * cannot sample them, draws the shader look. Look only: no price, gate or income reads it.
 */
import { HERO_ATLAS_CELLS } from '../../constants/scene'
import { manifestEntryOf, type ArtCatalogue } from '../art/artCatalogue'
import { folderOfEntry } from '../art/assetManifest'
import { HERO_LOOK_CELL_SPAN } from './kindLookTable'

/** One page of an act's atlas: its `atlas` asset under `public/assets/ground/` and its cells. */
export interface HeroAtlasPage {
  assetId: string
  /** The species of each cell, cell 0 first (column `i mod 4`, row `i div 4`). */
  cells: readonly string[]
}

/** One act's atlas as the slice names it. */
export interface HeroAtlasCells {
  /** The act; the resident pages swap only when this changes. */
  id: string
  /** Page 1 first. */
  pages: readonly HeroAtlasPage[]
}

/** A hero an act packs, in the act's order, and the page its skin row records (null for none). */
export interface HeroPlacement {
  speciesId: string
  page: number | null
}

/** The pages whose maps ship: what the terrain loads, each URL relative to the page. */
export interface DrawnHeroAtlas {
  id: string
  /** One albedo map per drawn page, page 1 first: the layers of the bound texture. */
  albedos: readonly string[]
  /** Each species of the drawn pages by its act-wide cell (`heroCellsOf`). */
  heroCells: ReadonlyMap<string, number>
}

const PUBLIC_FOLDER = 'public/'

/**
 * The act's pages, page 1 first: a hero whose skin row records a page sits on it, and the rest,
 * in the act's order, take the first page with room, a new one opening when every page is full.
 * Cells follow the act's order within a page. A recorded page over its cells is packed anyway and
 * named by `heroPlacementProblems`.
 */
export function packHeroPages(
  heroes: readonly HeroPlacement[],
  cellsPerPage: number = HERO_ATLAS_CELLS,
): string[][] {
  const pages = pagesOfRecorded(heroes)
  for (const hero of heroes.filter((candidate) => !isRecorded(candidate))) {
    pageWithRoomOf(pages, cellsPerPage).push(hero.speciesId)
  }
  const order = heroes.map((hero) => hero.speciesId)
  return pages.map((cells) => [...cells].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
}

function pagesOfRecorded(heroes: readonly HeroPlacement[]): string[][] {
  const recorded = heroes.filter(isRecorded)
  const lastPage = Math.max(0, ...recorded.map((hero) => hero.page))
  const pages = Array.from({ length: lastPage }, (): string[] => [])
  for (const hero of recorded) pages[hero.page - 1].push(hero.speciesId)
  return pages
}

/** A placement naming a page from 1; any other page is a problem and packs as if unrecorded. */
function isRecorded(hero: HeroPlacement): hero is HeroPlacement & { page: number } {
  return hero.page !== null && isPageNumber(hero.page)
}

function pageWithRoomOf(pages: string[][], cellsPerPage: number): string[] {
  const open = pages.find((cells) => cells.length < cellsPerPage)
  if (open !== undefined) return open
  const opened: string[] = []
  pages.push(opened)
  return opened
}

/** Why the placements cannot be packed; empty when they can. */
export function heroPlacementProblems(act: string, heroes: readonly HeroPlacement[]): string[] {
  return heroes
    .filter((hero) => hero.page !== null && !isPageNumber(hero.page))
    .map((hero) => `${act} records ${hero.speciesId} on page ${hero.page}, not a page from 1`)
}

function isPageNumber(page: number): boolean {
  return Number.isSafeInteger(page) && page >= 1
}

/**
 * Null while the act has no atlas or its first page's map is not final: every hero draws the
 * shader look. Otherwise the leading pages whose maps are final, so a page's layer is its number
 * less one and a hero on a page with no map yet keeps the shader look.
 */
export function drawnHeroAtlasOf(
  atlas: HeroAtlasCells | null,
  art: ArtCatalogue,
): DrawnHeroAtlas | null {
  if (atlas === null) return null
  const albedos = leadingAlbedoMapsOf(atlas.pages, art)
  if (albedos.length === 0) return null
  return { id: atlas.id, albedos, heroCells: heroCellsOf(atlas.pages.slice(0, albedos.length)) }
}

function leadingAlbedoMapsOf(pages: readonly HeroAtlasPage[], art: ArtCatalogue): string[] {
  const maps = pages.map((page) => atlasAlbedoMapOf(art, page.assetId))
  const missing = maps.indexOf(null)
  return (missing === -1 ? maps : maps.slice(0, missing)) as string[]
}

/** The albedo map of a final `atlas` asset, or null. */
export function atlasAlbedoMapOf(art: ArtCatalogue, assetId: string): string | null {
  const entry = manifestEntryOf(art, assetId)
  if (entry?.form !== 'atlas' || entry.status !== 'final') return null
  const folder = folderOfEntry(entry)?.slice(PUBLIC_FOLDER.length) ?? ''
  return `${folder}${entry.id}.albedo.ktx2`
}

/**
 * Each species' act-wide cell, for the look table (`kindLookTable.ts`): its cell on its page plus
 * 16 for every page before it, so page 1's cells keep their numbers.
 */
export function heroCellsOf(pages: readonly HeroAtlasPage[]): Map<string, number> {
  return new Map(
    pages.flatMap((page, at) =>
      page.cells.map((speciesId, cell): [string, number] => [
        speciesId,
        at * HERO_ATLAS_CELLS + cell,
      ]),
    ),
  )
}

/** The page (from 1) an act-wide cell lies on. */
export function heroPageOfCell(cell: number): number {
  return Math.floor(cell / HERO_ATLAS_CELLS) + 1
}

/** The most pages the look table's cell field can number (`HERO_LOOK_CELL_SPAN`). */
export const HERO_ATLAS_MAX_PAGES = Math.floor((HERO_LOOK_CELL_SPAN - 1) / HERO_ATLAS_CELLS)

/** Why an atlas's pages cannot be drawn; empty when they can. */
export function heroAtlasProblems(atlas: HeroAtlasCells): string[] {
  const species = atlas.pages.flatMap((page) => page.cells)
  const repeated = species.filter((id, at) => species.indexOf(id) !== at)
  return [
    ...atlas.pages.flatMap((page, at) => pageProblems(atlas.id, page, at + 1)),
    ...repeated.map((id) => `${atlas.id} packs ${id} twice`),
    ...(atlas.pages.length <= HERO_ATLAS_MAX_PAGES
      ? []
      : [
          `${atlas.id} has ${atlas.pages.length} pages, over the ${HERO_ATLAS_MAX_PAGES} the look table numbers`,
        ]),
  ]
}

function pageProblems(act: string, page: HeroAtlasPage, number: number): string[] {
  if (page.cells.length === 0) return [`${act} page ${number} packs no hero`]
  if (page.cells.length <= HERO_ATLAS_CELLS) return []
  return [
    `${act} page ${number} packs ${page.cells.length} heroes, over the ${HERO_ATLAS_CELLS} cells`,
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
