import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HERO_ATLAS_CELL_PX,
  HERO_ATLAS_CELLS,
  HERO_ATLAS_LEVELS,
  HERO_ATLAS_MAX_RESIDENT_BYTES,
  HERO_ATLAS_SIDE_PX,
} from '../../../constants/scene'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { readKtx2Header, readKtx2LevelCount } from '../../../systems/art/ktx2Header'
import { drawnHeroAtlasOf, residentBytesOf } from '../../../systems/render/heroAtlas'
import { MATERIALS } from '../../materials'
import { ORE_ROWS } from '../../ores'
import {
  atlasOfRow,
  HERO_ATLASES,
  heroAtlasArtAssets,
  heroAtlasAssetIdOf,
  heroAtlasOfAct,
  heroAtlasRowProblems,
  loadHeroAtlases,
} from './heroAtlases'
import type { SkinRow } from './skinLayers'
import { MINERAL_SKINS } from './skinTable'

// Ticket 451's atlas rows (TD shape 6226270701 "#451 shape"): every cell a hero species, packed in
// the order the #452 art packs it per act (ticket 744: the legacy four, then P2's three gems in the
// foothold.heavy atlas; ticket 785: P1's three gems after the legacy four in foothold.base, and
// the nine gems of P3 to P5 after P2's, filling foothold.heavy's page 1), each cell shipped as a
// 256 px RGBA cell, and each shipped page one 1024 px ETC1S map within 2 MiB. Ticket 852 makes an
// act's pages unbounded: a hero's page lives on its skin row, and a new page opens when the last
// is full.

const REPO = new URL('../../../../', import.meta.url)
const ART = new URL('docs/art/ore-heroes/', REPO)

interface HeroCellTable {
  atlases: { act: string; cells: { index: number; page: number; speciesId: string }[] }[]
  heroes: { speciesId: string; set: string; cell: string }[]
}

const HERO_CELLS = JSON.parse(
  readFileSync(new URL('hero-cells.json', ART), 'utf8'),
) as HeroCellTable
const HERO_CELL_PX = HERO_ATLAS_CELL_PX
/** PNG colour type 6: RGB with the mask in alpha. */
const RGBA_COLOUR_TYPE = 6
const HERO_SPECIES = MATERIALS.materials.filter((m) => m.hero).map((m) => m.id)
/** Ticket 852's synthetic overflow: one more hero than a page holds. */
const OVERFLOW = { act: 'fire', heroes: HERO_SPECIES.slice(0, HERO_ATLAS_CELLS + 1) }

/** Width, height and colour type from a PNG's IHDR chunk. */
function pngHeaderOf(path: string) {
  const bytes = readFileSync(new URL(path, ART))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] }
}

const shippedBytesOf = (path: string) =>
  new Uint8Array(readFileSync(new URL(`public/${path}`, REPO)))

const cellsOf = (act: string) => heroAtlasOfAct(act)?.pages.flatMap((page) => page.cells)

/** A skin row for each species, recording the page given (or none). */
function skinsRecording(pages: Readonly<Record<string, number | undefined>>): SkinRow[] {
  return Object.entries(pages).map(([species, atlasPage]) => ({
    species,
    base: 'granular',
    vein: 'brass-thread',
    palette: 'umber',
    sheen: 'dull',
    ...(atlasPage === undefined ? {} : { atlasPage }),
  }))
}

describe('hero atlases (ticket 451)', () => {
  it('names each atlas asset from its act under the ground category, page 1 keeping its id', () => {
    expect(heroAtlasAssetIdOf('foothold.base')).toBe('ground-hero-atlas-foothold-base')
    expect(heroAtlasOfAct('foothold.heavy')?.pages[0].assetId).toBe(
      'ground-hero-atlas-foothold-heavy',
    )
  })

  it("packs the #452 cells of every act the art packs, page by page, in that act's order", () => {
    const pagesOf = (atlas: HeroCellTable['atlases'][number]) => {
      const last = Math.max(...atlas.cells.map((cell) => cell.page))
      return Array.from({ length: last }, (_, at) =>
        atlas.cells
          .filter((cell) => cell.page === at + 1)
          .sort((a, b) => a.index - b.index)
          .map((cell) => cell.speciesId),
      )
    }
    expect(
      HERO_CELLS.atlases.map((atlas) => heroAtlasOfAct(atlas.act)?.pages.map((p) => p.cells)),
    ).toEqual(HERO_CELLS.atlases.map(pagesOf))
  })

  it("packs the legacy four first in both acts, then P1's gems in foothold.base and P2's, P3's, P4's and P5's gems in foothold.heavy (tickets 744 and 785)", () => {
    const legacy = HERO_CELLS.heroes
      .filter((hero) => hero.set === 'legacy')
      .map((hero) => hero.speciesId)
    expect(legacy).toHaveLength(4)
    expect(cellsOf('foothold.base')).toEqual([
      ...legacy,
      'diamond-quartzine',
      'emerald-quartzine',
      'ruby-quartzine',
    ])
    expect(cellsOf('foothold.heavy')).toEqual([
      ...legacy,
      'p2-r1',
      'p2-r2',
      'p2-r4',
      'blue-topaz-quartzine',
      'orichalcum-brassvein',
      'heart-diamond-quartzine',
      'watermelon-tourmaline-quartzine',
      'starsteel-brassvein',
      'painite-quartzine',
      'fire-garnet-quartzine',
      'core-gold-brassvein',
      'furnace-ruby-quartzine',
    ])
    expect(heroAtlasOfAct('foothold.heavy')?.pages[0].cells).toHaveLength(HERO_ATLAS_CELLS)
  })

  it('packs every gem of P1 to P5 that sells as a gem, keyed on its species id (ticket 785)', () => {
    const packed = new Set(HERO_ATLASES.flatMap((atlas) => atlas.pages.flatMap((p) => p.cells)))
    const gemSlotsOf = (pool: string) =>
      ORE_ROWS.gems.pools.find((row) => row.pool === pool)?.slotIds ?? []
    const gems = MATERIALS.materials.filter((material) =>
      gemSlotsOf(material.pool).includes(material.slot),
    )
    expect(gems).toHaveLength(15)
    expect(gems.filter((gem) => !packed.has(gem.id))).toEqual([])
  })

  it('ships every packed species as a 256 px RGBA cell', () => {
    const packed = new Set(HERO_ATLASES.flatMap((atlas) => atlas.pages.flatMap((p) => p.cells)))
    const cells = HERO_CELLS.heroes.filter((hero) => packed.has(hero.speciesId))
    expect(cells.map((hero) => hero.speciesId).sort()).toEqual([...packed].sort())
    for (const hero of cells) {
      expect(pngHeaderOf(hero.cell), hero.speciesId).toEqual({
        width: HERO_CELL_PX,
        height: HERO_CELL_PX,
        colourType: RGBA_COLOUR_TYPE,
      })
    }
  })

  it('packs only hero species', () => {
    const heroes = new Set(HERO_SPECIES)
    const packed = HERO_ATLASES.flatMap((atlas) => atlas.pages.flatMap((p) => p.cells))
    expect(packed.filter((id) => !heroes.has(id))).toEqual([])
  })

  it('refuses a species that is no hero, an act listed twice and more than 16 cells on a page', () => {
    const notHero = MATERIALS.materials.find((m) => !m.hero)?.id ?? 'missing'
    const crowded = HERO_SPECIES.slice(0, HERO_ATLAS_CELLS + 1)
    const onPageOne = skinsRecording(Object.fromEntries(crowded.map((id) => [id, 1])))
    expect(
      heroAtlasRowProblems(
        [
          { act: 'fire', heroes: [notHero] },
          { act: 'fire', heroes: [] },
        ],
        [],
      ),
    ).toEqual([
      'fire has two atlases',
      `fire packs ${notHero}, which is no hero species`,
      `fire packs ${notHero} on page 1; it has no skin row to record it`,
    ])
    expect(() => loadHeroAtlases([{ act: 'frost', heroes: crowded }], onPageOne)).toThrow(
      /frost page 1 packs 17 heroes, over the 16 cells/,
    )
  })

  it('hands every planet of an act one atlas object, so a planet change inside it swaps nothing', () => {
    expect(heroAtlasOfAct('foothold.heavy')).toBe(heroAtlasOfAct('foothold.heavy'))
    expect(heroAtlasOfAct('fire')).toBe(null)
  })

  it('ships each page as one 1024 px ETC1S sRGB map of four levels, within 2 MiB resident', () => {
    for (const atlas of HERO_ATLASES) {
      const drawn = drawnHeroAtlasOf(atlas, SHIPPED_ART)
      expect(drawn?.albedos, atlas.id).toHaveLength(atlas.pages.length)
      for (const albedo of drawn?.albedos ?? []) {
        const bytes = shippedBytesOf(albedo)
        expect(readKtx2Header(bytes), albedo).toEqual({
          width: HERO_ATLAS_SIDE_PX,
          height: HERO_ATLAS_SIDE_PX,
          encoding: 'etc1s',
          transfer: 'srgb',
        })
        const levels = readKtx2LevelCount(bytes) ?? 0
        expect(levels).toBe(HERO_ATLAS_LEVELS)
        expect(residentBytesOf(HERO_ATLAS_SIDE_PX, levels, 1)).toBeLessThanOrEqual(
          HERO_ATLAS_MAX_RESIDENT_BYTES,
        )
      }
    }
  })
})

describe('hero atlas pages (ticket 852)', () => {
  it('records on its skin row the page every packed hero sits on', () => {
    const recorded = new Map(MINERAL_SKINS.skins.map((skin) => [skin.species, skin.atlasPage]))
    const misplaced = HERO_ATLASES.flatMap((atlas) =>
      atlas.pages.flatMap((page, at) =>
        page.cells.filter((id) => recorded.get(id) !== at + 1).map((id) => `${atlas.id} ${id}`),
      ),
    )
    expect(misplaced).toEqual([])
  })

  it('opens page 2 for a synthetic overflow, its asset named for the page', () => {
    const atlas = atlasOfRow(OVERFLOW, [])
    expect(atlas.pages.map((page) => page.cells.length)).toEqual([HERO_ATLAS_CELLS, 1])
    expect(atlas.pages[1]).toEqual({
      assetId: 'ground-hero-atlas-fire-page-2',
      cells: [OVERFLOW.heroes[HERO_ATLAS_CELLS]],
    })
  })

  it('names the page the packer opened for a hero whose skin row records none', () => {
    const pages = Object.fromEntries(OVERFLOW.heroes.map((id, at) => [id, at < 16 ? 1 : undefined]))
    const last = OVERFLOW.heroes[HERO_ATLAS_CELLS]
    expect(heroAtlasRowProblems([OVERFLOW], skinsRecording(pages))).toEqual([
      `fire packs ${last} on page 2; its skin row records no atlasPage`,
    ])
  })

  it('loads the overflow once every skin row records the page it sits on', () => {
    const pages = Object.fromEntries(OVERFLOW.heroes.map((id, at) => [id, at < 16 ? 1 : 2]))
    const [atlas] = loadHeroAtlases([OVERFLOW], skinsRecording(pages))
    expect(atlas.pages.map((page) => page.assetId)).toEqual([
      'ground-hero-atlas-fire',
      'ground-hero-atlas-fire-page-2',
    ])
  })

  it("keeps a page's heroes where their rows put them when a hero joins earlier in the act", () => {
    const later = [HERO_SPECIES[20], ...OVERFLOW.heroes]
    const pages = Object.fromEntries(OVERFLOW.heroes.map((id, at) => [id, at < 16 ? 1 : 2]))
    const atlas = atlasOfRow({ act: 'fire', heroes: later }, skinsRecording(pages))
    expect(atlas.pages[0].cells).toEqual(OVERFLOW.heroes.slice(0, HERO_ATLAS_CELLS))
    expect(atlas.pages[1].cells).toEqual([HERO_SPECIES[20], OVERFLOW.heroes[HERO_ATLAS_CELLS]])
  })

  it('refuses a skin row recording a page for a species no act packs', () => {
    const stray = HERO_SPECIES[30]
    expect(heroAtlasRowProblems([], skinsRecording({ [stray]: 2 }))).toEqual([
      `${stray} records atlasPage 2, but no act packs it`,
    ])
  })

  it('registers one art asset per page of every act', () => {
    expect(heroAtlasArtAssets().map((asset) => asset.id)).toEqual(
      HERO_ATLASES.flatMap((atlas) => atlas.pages.map((page) => page.assetId)),
    )
  })
})
