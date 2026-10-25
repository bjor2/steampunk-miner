/**
 * Which hero species each act's atlas holds, page by page (ticket 451 under #139; TD shape
 * 6226270701 "#451 shape"; pages, ticket 852): read once from `heroAtlases.json` and refused whole
 * when broken. An act lists its heroes in packing order; the page each sits on is its skin row's
 * `atlasPage` (HS ruling (a) of 24 Oct: the page lives on the skin row in data), so a page never
 * moves once its art ships. The kernel packer (`packHeroPages`) would put a hero with no page on
 * the first page with room, opening a new page when the last is full, and the refusal names that
 * page for the row to record. Every hero is a `hero: true` species, a page holds at most 16 and no
 * hero sits in an act twice. Each atlas is one object, handed to every planet of its act, so a
 * planet change inside an act swaps nothing. Page 1's art is the `atlas` asset
 * `ground-hero-atlas-<act>` under `public/assets/ground/`, page n's `ground-hero-atlas-<act>-page-n`.
 * Look only: horizontal, no price, gate or income reads it.
 */
import { kebabOf } from '../../../systems/art/artNaming'
import type { ArtAsset } from '../../../systems/registries/artAssets'
import {
  heroAtlasProblems,
  heroPlacementProblems,
  packHeroPages,
  type HeroAtlasCells,
  type HeroPlacement,
} from '../../../systems/render/heroAtlas'
import { MATERIALS, type MaterialTable } from '../../materials'
import heroAtlasesFile from '../heroAtlases.json'
import type { SkinRow } from './skinLayers'
import { MINERAL_SKINS } from './skinTable'

export interface HeroAtlasRow {
  act: string
  /** The act's heroes in packing order. */
  heroes: readonly string[]
}

const FIRST_PAGE = 1

/** Page 1 keeps the act's own id, so the atlases shipped before pages keep theirs. */
export function heroAtlasAssetIdOf(actId: string, page: number = FIRST_PAGE): string {
  const actAsset = `ground-hero-atlas-${kebabOf(actId).replaceAll('.', '-')}`
  return page === FIRST_PAGE ? actAsset : `${actAsset}-page-${page}`
}

/** Why the rows cannot ship as atlases; empty when they can. */
export function heroAtlasRowProblems(
  rows: readonly HeroAtlasRow[],
  skins: readonly SkinRow[] = MINERAL_SKINS.skins,
  table: MaterialTable = MATERIALS,
): string[] {
  const acts = rows.map((row) => row.act)
  return [
    ...acts.filter((act, at) => acts.indexOf(act) !== at).map((act) => `${act} has two atlases`),
    ...rows.flatMap((row) => notHeroProblems(row, table)),
    ...rows.flatMap((row) => heroPlacementProblems(row.act, placementsOf(row, skins))),
    ...rows.flatMap((row) => heroAtlasProblems(atlasOfRow(row, skins))),
    ...rows.flatMap((row) => unrecordedPageProblems(row, skins)),
    ...strayPageProblems(rows, skins),
  ]
}

function notHeroProblems(row: HeroAtlasRow, table: MaterialTable): string[] {
  return row.heroes
    .filter((id) => table.materials.find((material) => material.id === id)?.hero !== true)
    .map((id) => `${row.act} packs ${id}, which is no hero species`)
}

/** A packed hero whose skin row does not record the page it sits on, with the page to write. */
function unrecordedPageProblems(row: HeroAtlasRow, skins: readonly SkinRow[]): string[] {
  return atlasOfRow(row, skins).pages.flatMap((page, at) =>
    page.cells
      .filter((id) => skinOf(skins, id)?.atlasPage !== at + 1)
      .map((id) => `${row.act} packs ${id} on page ${at + 1}; ${recordedPageOf(skins, id)}`),
  )
}

function recordedPageOf(skins: readonly SkinRow[], speciesId: string): string {
  const skin = skinOf(skins, speciesId)
  if (skin === undefined) return 'it has no skin row to record it'
  if (skin.atlasPage === undefined) return 'its skin row records no atlasPage'
  return `its skin row records atlasPage ${skin.atlasPage}`
}

/** A skin row recording a page no act packs its species on. */
function strayPageProblems(rows: readonly HeroAtlasRow[], skins: readonly SkinRow[]): string[] {
  const packed = new Set(rows.flatMap((row) => row.heroes))
  return skins
    .filter((skin) => skin.atlasPage !== undefined && !packed.has(skin.species))
    .map((skin) => `${skin.species} records atlasPage ${skin.atlasPage}, but no act packs it`)
}

export function loadHeroAtlases(
  rows: readonly HeroAtlasRow[],
  skins: readonly SkinRow[] = MINERAL_SKINS.skins,
  table: MaterialTable = MATERIALS,
): HeroAtlasCells[] {
  const problems = heroAtlasRowProblems(rows, skins, table)
  if (problems.length > 0) throw new Error(`heroAtlases.json is refused:\n${problems.join('\n')}`)
  return rows.map((row) => atlasOfRow(row, skins))
}

/** The act's pages as the kernel packer lays them out from the skin rows' recorded pages. */
export function atlasOfRow(row: HeroAtlasRow, skins: readonly SkinRow[]): HeroAtlasCells {
  return {
    id: row.act,
    pages: packHeroPages(placementsOf(row, skins)).map((cells, at) => ({
      assetId: heroAtlasAssetIdOf(row.act, at + FIRST_PAGE),
      cells,
    })),
  }
}

function placementsOf(row: HeroAtlasRow, skins: readonly SkinRow[]): HeroPlacement[] {
  return row.heroes.map((speciesId) => ({
    speciesId,
    page: skinOf(skins, speciesId)?.atlasPage ?? null,
  }))
}

function skinOf(skins: readonly SkinRow[], speciesId: string): SkinRow | undefined {
  return skins.find((skin) => skin.species === speciesId)
}

export const HERO_ATLASES: readonly HeroAtlasCells[] = loadHeroAtlases(heroAtlasesFile.atlases)

/** The act's atlas, or null: every hero of the act draws the shader look. */
export function heroAtlasOfAct(actId: string): HeroAtlasCells | null {
  return HERO_ATLASES.find((atlas) => atlas.id === actId) ?? null
}

/** Every page's art, joining the kernel's #51 inventory (#214). */
export function heroAtlasArtAssets(): ArtAsset[] {
  return HERO_ATLASES.flatMap((atlas) =>
    atlas.pages.map((page) => ({ id: page.assetId, category: 'ground' as const })),
  )
}
