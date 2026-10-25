import { describe, expect, it } from 'vitest'
import {
  HERO_ATLAS_CELLS,
  HERO_ATLAS_LEVELS,
  HERO_ATLAS_MAX_RESIDENT_BYTES,
  HERO_ATLAS_SIDE_PX,
} from '../../constants/scene'
import { artCatalogueOf } from '../art/artCatalogue'
import type { ManifestEntry } from '../art/assetManifest'
import {
  drawnHeroAtlasOf,
  HERO_ATLAS_MAX_PAGES,
  heroAtlasProblems,
  heroCellsOf,
  heroPageOfCell,
  heroPlacementProblems,
  overflowedHeroAtlasOf,
  packHeroPages,
  residentBytesOf,
  firstHueTintedCellOf,
  type HeroAtlasCells,
  type HeroPlacement,
} from './heroAtlas'
import { HERO_LOOK_CELL_SPAN } from './kindLookTable'

const PAGE_ONE = 'ground-hero-atlas-foothold-base'
const PAGE_TWO = 'ground-hero-atlas-foothold-base-page-2'

const ATLAS: HeroAtlasCells = {
  id: 'foothold.base',
  pages: [{ assetId: PAGE_ONE, cells: ['violet-fluorite-quartzine', 'vein-gold-brassvein'] }],
}

/** Ticket 852's synthetic overflow: one more hero than a page holds, none with a recorded page. */
const OVERFLOW: HeroPlacement[] = Array.from({ length: HERO_ATLAS_CELLS + 1 }, (_, at) => ({
  speciesId: `hero-${at}`,
  page: null,
}))

const TWO_PAGES: HeroAtlasCells = {
  id: 'foothold.base',
  pages: packHeroPages(OVERFLOW).map((cells, at) => ({
    assetId: at === 0 ? PAGE_ONE : PAGE_TWO,
    cells,
  })),
}

const CUT_PAGE = 'ground-gem-cut-atlas'

/** Ticket 889: the gem-cut library's hue-tinted page after the act's own page. */
const WITH_CUTS: HeroAtlasCells = {
  id: 'foothold.heavy',
  pages: [...ATLAS.pages, { assetId: CUT_PAGE, cells: ['gem-cut.brilliant'], isHueTinted: true }],
}

const atlasEntry = (id: string, status: ManifestEntry['status']): ManifestEntry => ({
  id,
  source: 'blender',
  form: 'atlas',
  status,
})

const artWith = (entries: ManifestEntry[]) => artCatalogueOf(entries, [], [])

const mapOf = (id: string) => `assets/ground/${id}/${id}.albedo.ktx2`

describe('hero atlas (ticket 451)', () => {
  it('loads a final atlas from its albedo map under public/assets/ground', () => {
    expect(drawnHeroAtlasOf(ATLAS, artWith([atlasEntry(PAGE_ONE, 'final')]))).toEqual({
      id: 'foothold.base',
      albedos: [mapOf(PAGE_ONE)],
      heroCells: new Map([
        ['violet-fluorite-quartzine', 0],
        ['vein-gold-brassvein', 1],
      ]),
      firstHueTintedCell: null,
    })
  })

  it('loads nothing for an act with no atlas or an atlas that is not final yet', () => {
    expect(drawnHeroAtlasOf(null, artWith([atlasEntry(PAGE_ONE, 'final')]))).toBe(null)
    expect(drawnHeroAtlasOf(ATLAS, artWith([atlasEntry(PAGE_ONE, 'placeholder')]))).toBe(null)
    expect(drawnHeroAtlasOf(ATLAS, artWith([]))).toBe(null)
  })

  it('numbers each species by its cell, cell 0 first', () => {
    expect([...heroCellsOf(ATLAS.pages)]).toEqual([
      ['violet-fluorite-quartzine', 0],
      ['vein-gold-brassvein', 1],
    ])
  })

  it('refuses more heroes on a page than its 16 cells, an empty page and a hero packed twice', () => {
    const crowded = Array.from({ length: HERO_ATLAS_CELLS + 1 }, (_, at) => `hero-${at}`)
    expect(heroAtlasProblems({ ...ATLAS, pages: [{ assetId: PAGE_ONE, cells: crowded }] })).toEqual(
      ['foothold.base page 1 packs 17 heroes, over the 16 cells'],
    )
    expect(
      heroAtlasProblems({
        ...ATLAS,
        pages: [
          { assetId: PAGE_ONE, cells: [] },
          { assetId: PAGE_TWO, cells: ['a', 'b', 'a'] },
        ],
      }),
    ).toEqual(['foothold.base page 1 packs no hero', 'foothold.base packs a twice'])
    expect(heroAtlasProblems(ATLAS)).toEqual([])
    expect(heroAtlasProblems(TWO_PAGES)).toEqual([])
  })

  it('holds a page within 2 MiB resident at a byte a texel, and RGBA8 would not fit', () => {
    const compressed = residentBytesOf(HERO_ATLAS_SIDE_PX, HERO_ATLAS_LEVELS, 1)
    expect(compressed).toBe(1024 * 1024 + 512 * 512 + 256 * 256 + 128 * 128)
    expect(compressed).toBeLessThanOrEqual(HERO_ATLAS_MAX_RESIDENT_BYTES)
    expect(residentBytesOf(HERO_ATLAS_SIDE_PX, 11, 4)).toBeGreaterThan(
      HERO_ATLAS_MAX_RESIDENT_BYTES,
    )
  })
})

describe('hero atlas pages (ticket 852)', () => {
  it('opens page 2 when page 1 is full, the 17th hero first on it', () => {
    const pages = packHeroPages(OVERFLOW)
    expect(pages.map((cells) => cells.length)).toEqual([HERO_ATLAS_CELLS, 1])
    expect(pages[1]).toEqual([`hero-${HERO_ATLAS_CELLS}`])
  })

  it('keeps a hero on the page its skin row records and fills the rest from page 1', () => {
    const heroes: HeroPlacement[] = [
      { speciesId: 'early', page: 2 },
      { speciesId: 'second', page: null },
      { speciesId: 'third', page: 1 },
      { speciesId: 'late', page: null },
    ]
    expect(packHeroPages(heroes)).toEqual([['second', 'third', 'late'], ['early']])
  })

  it('opens no page while every page has room, however many heroes come later', () => {
    const pages = packHeroPages(OVERFLOW.slice(0, HERO_ATLAS_CELLS))
    expect(pages).toHaveLength(1)
  })

  it('opens a page each time the last fills, so pages are unbounded', () => {
    const many = Array.from({ length: 5 * HERO_ATLAS_CELLS + 3 }, (_, at) => ({
      speciesId: `hero-${at}`,
      page: null,
    }))
    expect(packHeroPages(many).map((cells) => cells.length)).toEqual([16, 16, 16, 16, 16, 3])
  })

  it('numbers a page-2 hero past page 1, so page 1 keeps its cell numbers', () => {
    const cells = heroCellsOf(TWO_PAGES.pages)
    expect(cells.get('hero-0')).toBe(0)
    expect(cells.get('hero-15')).toBe(HERO_ATLAS_CELLS - 1)
    expect(cells.get(`hero-${HERO_ATLAS_CELLS}`)).toBe(HERO_ATLAS_CELLS)
    expect(heroPageOfCell(HERO_ATLAS_CELLS - 1)).toBe(1)
    expect(heroPageOfCell(HERO_ATLAS_CELLS)).toBe(2)
  })

  it('draws both pages as layers when both maps ship, page 1 first', () => {
    const art = artWith([atlasEntry(PAGE_ONE, 'final'), atlasEntry(PAGE_TWO, 'final')])
    const drawn = drawnHeroAtlasOf(TWO_PAGES, art)
    expect(drawn?.albedos).toEqual([mapOf(PAGE_ONE), mapOf(PAGE_TWO)])
    expect(drawn?.heroCells.get(`hero-${HERO_ATLAS_CELLS}`)).toBe(HERO_ATLAS_CELLS)
  })

  it('draws page 1 alone while page 2 has no final map, its heroes keeping the shader look', () => {
    const art = artWith([atlasEntry(PAGE_ONE, 'final'), atlasEntry(PAGE_TWO, 'placeholder')])
    const drawn = drawnHeroAtlasOf(TWO_PAGES, art)
    expect(drawn?.albedos).toEqual([mapOf(PAGE_ONE)])
    expect(drawn?.heroCells.has(`hero-${HERO_ATLAS_CELLS}`)).toBe(false)
    expect(drawn?.heroCells.get('hero-0')).toBe(0)
  })

  it('refuses a recorded page that is not a whole number from 1', () => {
    expect(
      heroPlacementProblems('fire', [
        { speciesId: 'a', page: 0 },
        { speciesId: 'b', page: 1.5 },
        { speciesId: 'c', page: 2 },
      ]),
    ).toEqual([
      'fire records a on page 0, not a page from 1',
      'fire records b on page 1.5, not a page from 1',
    ])
  })

  it('numbers every cell of the most pages the look table carries, and refuses one more page', () => {
    expect(HERO_ATLAS_MAX_PAGES * HERO_ATLAS_CELLS - 1).toBeLessThan(HERO_LOOK_CELL_SPAN - 1)
    const pages = Array.from({ length: HERO_ATLAS_MAX_PAGES + 1 }, (_, at) => ({
      assetId: `page-${at + 1}`,
      cells: [`hero-${at}`],
    }))
    expect(heroAtlasProblems({ id: 'fire', pages })).toEqual([
      `fire has ${HERO_ATLAS_MAX_PAGES + 1} pages, over the ${HERO_ATLAS_MAX_PAGES} the look table numbers`,
    ])
  })

  it('overflows the drawn pages onto the pages after them, every hero on its cell there', () => {
    const drawn = drawnHeroAtlasOf(ATLAS, artWith([atlasEntry(PAGE_ONE, 'final')]))
    const overflowed = drawn === null ? null : overflowedHeroAtlasOf(drawn)
    expect(overflowed).toEqual({
      id: 'foothold.base#overflow',
      albedos: [mapOf(PAGE_ONE), mapOf(PAGE_ONE)],
      heroCells: new Map([
        ['violet-fluorite-quartzine', HERO_ATLAS_CELLS],
        ['vein-gold-brassvein', HERO_ATLAS_CELLS + 1],
      ]),
      firstHueTintedCell: null,
    })
  })

  it("draws the gem-cut library's hue-tinted page after the act's own and says where it begins (ticket 889)", () => {
    const art = artWith([atlasEntry(PAGE_ONE, 'final'), atlasEntry(CUT_PAGE, 'final')])
    const drawn = drawnHeroAtlasOf(WITH_CUTS, art)
    expect(drawn?.albedos).toEqual([mapOf(PAGE_ONE), mapOf(CUT_PAGE)])
    expect(drawn?.heroCells.get('gem-cut.brilliant')).toBe(HERO_ATLAS_CELLS)
    expect(drawn?.firstHueTintedCell).toBe(HERO_ATLAS_CELLS)
    expect(firstHueTintedCellOf(WITH_CUTS.pages)).toBe(HERO_ATLAS_CELLS)
    expect(firstHueTintedCellOf(ATLAS.pages)).toBe(null)
    expect(heroAtlasProblems(WITH_CUTS)).toEqual([])
  })

  it('tints no cell while the cut page has no final map, and moves the first tinted cell with an overflow', () => {
    const art = artWith([atlasEntry(PAGE_ONE, 'final'), atlasEntry(CUT_PAGE, 'placeholder')])
    expect(drawnHeroAtlasOf(WITH_CUTS, art)?.firstHueTintedCell).toBe(null)
    const both = artWith([atlasEntry(PAGE_ONE, 'final'), atlasEntry(CUT_PAGE, 'final')])
    const drawn = drawnHeroAtlasOf(WITH_CUTS, both)
    const overflowed = drawn === null ? null : overflowedHeroAtlasOf(drawn)
    expect(overflowed?.firstHueTintedCell).toBe(3 * HERO_ATLAS_CELLS)
    expect(overflowed?.heroCells.get('gem-cut.brilliant')).toBe(3 * HERO_ATLAS_CELLS)
  })

  it('refuses a page that is not hue-tinted after one that is, since the shader tints every cell from the first', () => {
    const pages = [...WITH_CUTS.pages, { assetId: PAGE_TWO, cells: ['late-hero'] }]
    expect(heroAtlasProblems({ id: 'foothold.heavy', pages })).toEqual([
      'foothold.heavy page 3 is not hue-tinted but follows a page that is',
    ])
  })
})
