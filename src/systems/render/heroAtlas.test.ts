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
  heroAtlasProblems,
  heroCellsOf,
  residentBytesOf,
  type HeroAtlasCells,
} from './heroAtlas'

const ATLAS: HeroAtlasCells = {
  id: 'foothold.base',
  assetId: 'ground-hero-atlas-foothold-base',
  cells: ['violet-fluorite-quartzine', 'vein-gold-brassvein'],
}

const atlasEntry = (status: ManifestEntry['status']): ManifestEntry => ({
  id: ATLAS.assetId,
  source: 'blender',
  form: 'atlas',
  status,
})

const artWith = (entries: ManifestEntry[]) => artCatalogueOf(entries, [], [])

describe('hero atlas (ticket 451)', () => {
  it('loads a final atlas from its albedo map under public/assets/ground', () => {
    expect(drawnHeroAtlasOf(ATLAS, artWith([atlasEntry('final')]))).toEqual({
      id: 'foothold.base',
      albedo:
        'assets/ground/ground-hero-atlas-foothold-base/ground-hero-atlas-foothold-base.albedo.ktx2',
      cells: ATLAS.cells,
    })
  })

  it('loads nothing for an act with no atlas or an atlas that is not final yet', () => {
    expect(drawnHeroAtlasOf(null, artWith([atlasEntry('final')]))).toBe(null)
    expect(drawnHeroAtlasOf(ATLAS, artWith([atlasEntry('placeholder')]))).toBe(null)
    expect(drawnHeroAtlasOf(ATLAS, artWith([]))).toBe(null)
  })

  it('numbers each species by its cell, cell 0 first', () => {
    expect([...heroCellsOf(ATLAS.cells)]).toEqual([
      ['violet-fluorite-quartzine', 0],
      ['vein-gold-brassvein', 1],
    ])
  })

  it('refuses more heroes than the 16 cells and a hero packed twice', () => {
    const crowded = Array.from({ length: HERO_ATLAS_CELLS + 1 }, (_, at) => `hero-${at}`)
    expect(heroAtlasProblems({ ...ATLAS, cells: crowded })).toEqual([
      'foothold.base packs 17 heroes, over the 16 cells',
    ])
    expect(heroAtlasProblems({ ...ATLAS, cells: ['a', 'b', 'a'] })).toEqual([
      'foothold.base packs a twice',
    ])
    expect(heroAtlasProblems(ATLAS)).toEqual([])
  })

  it('holds the atlas within 2 MiB resident at a byte a texel, and RGBA8 would not fit', () => {
    const compressed = residentBytesOf(HERO_ATLAS_SIDE_PX, HERO_ATLAS_LEVELS, 1)
    expect(compressed).toBe(1024 * 1024 + 512 * 512 + 256 * 256 + 128 * 128)
    expect(compressed).toBeLessThanOrEqual(HERO_ATLAS_MAX_RESIDENT_BYTES)
    expect(residentBytesOf(HERO_ATLAS_SIDE_PX, 11, 4)).toBeGreaterThan(
      HERO_ATLAS_MAX_RESIDENT_BYTES,
    )
  })
})
