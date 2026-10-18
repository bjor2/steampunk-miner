/**
 * Which hero species each act's atlas holds (ticket 451 under #139; TD shape 6226270701 "#451
 * shape"): read once from `heroAtlases.json` and refused whole when broken. Every cell names a
 * `hero: true` species, an atlas holds at most 16 and none twice. Each atlas is one object, handed
 * to every planet of its act, so a planet change inside an act swaps nothing. Its art is an
 * `atlas` asset under `public/assets/ground/`, named from the act (`ground-hero-atlas-<act>`).
 * Look only: horizontal, no price, gate or income reads it.
 */
import { kebabOf } from '../../../../systems/art/artNaming'
import type { ArtAsset } from '../../../../systems/registries/artAssets'
import { heroAtlasProblems, type HeroAtlasCells } from '../../../../systems/render/heroAtlas'
import heroAtlasesFile from '../../heroAtlases.json'
import { MATERIALS, type MaterialTable } from '../materialTable'

interface HeroAtlasRow {
  act: string
  cells: readonly string[]
}

export function heroAtlasAssetIdOf(actId: string): string {
  return `ground-hero-atlas-${kebabOf(actId).replaceAll('.', '-')}`
}

/** Why the rows cannot ship as atlases; empty when they can. */
export function heroAtlasRowProblems(
  rows: readonly HeroAtlasRow[],
  table: MaterialTable = MATERIALS,
): string[] {
  const acts = rows.map((row) => row.act)
  return [
    ...acts.filter((act, at) => acts.indexOf(act) !== at).map((act) => `${act} has two atlases`),
    ...rows.flatMap((row) => heroAtlasProblems(atlasOfRow(row))),
    ...rows.flatMap((row) => notHeroProblems(row, table)),
  ]
}

function notHeroProblems(row: HeroAtlasRow, table: MaterialTable): string[] {
  return row.cells
    .filter((id) => table.materials.find((material) => material.id === id)?.hero !== true)
    .map((id) => `${row.act} packs ${id}, which is no hero species`)
}

export function loadHeroAtlases(
  rows: readonly HeroAtlasRow[],
  table: MaterialTable = MATERIALS,
): HeroAtlasCells[] {
  const problems = heroAtlasRowProblems(rows, table)
  if (problems.length > 0) throw new Error(`heroAtlases.json is refused:\n${problems.join('\n')}`)
  return rows.map(atlasOfRow)
}

function atlasOfRow(row: HeroAtlasRow): HeroAtlasCells {
  return { id: row.act, assetId: heroAtlasAssetIdOf(row.act), cells: row.cells }
}

export const HERO_ATLASES: readonly HeroAtlasCells[] = loadHeroAtlases(heroAtlasesFile.atlases)

/** The act's atlas, or null: every hero of the act draws the shader look. */
export function heroAtlasOfAct(actId: string): HeroAtlasCells | null {
  return HERO_ATLASES.find((atlas) => atlas.id === actId) ?? null
}

/** The atlases' art, joining the kernel's #51 inventory (#214). */
export function heroAtlasArtAssets(): ArtAsset[] {
  return HERO_ATLASES.map((atlas) => ({ id: atlas.assetId, category: 'ground' }))
}
