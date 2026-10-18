import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HERO_ATLAS_LEVELS,
  HERO_ATLAS_MAX_RESIDENT_BYTES,
  HERO_ATLAS_SIDE_PX,
} from '../../../../constants/scene'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { readKtx2Header, readKtx2LevelCount } from '../../../../systems/art/ktx2Header'
import { drawnHeroAtlasOf, residentBytesOf } from '../../../../systems/render/heroAtlas'
import { MATERIALS } from '../materialTable'
import {
  HERO_ATLASES,
  heroAtlasAssetIdOf,
  heroAtlasOfAct,
  heroAtlasRowProblems,
  loadHeroAtlases,
} from './heroAtlases'

// Ticket 451's atlas rows (TD shape 6226270701 "#451 shape"): every cell a hero species, packed in
// the order the #452 art packs it, and each shipped atlas one 1024 px ETC1S map within 2 MiB.

const REPO = new URL('../../../../../', import.meta.url)

interface HeroCellTable {
  acts: string[]
  cells: { index: number; speciesId: string }[]
}

const HERO_CELLS = JSON.parse(
  readFileSync(new URL('docs/art/ore-heroes/hero-cells.json', REPO), 'utf8'),
) as HeroCellTable

const shippedBytesOf = (path: string) =>
  new Uint8Array(readFileSync(new URL(`public/${path}`, REPO)))

describe('hero atlases (ticket 451)', () => {
  it('names each atlas asset from its act under the ground category', () => {
    expect(heroAtlasAssetIdOf('foothold.base')).toBe('ground-hero-atlas-foothold-base')
    expect(heroAtlasOfAct('foothold.heavy')?.assetId).toBe('ground-hero-atlas-foothold-heavy')
  })

  it('packs the #452 cells for every act the art packs, in its order', () => {
    const order = [...HERO_CELLS.cells].sort((a, b) => a.index - b.index).map((c) => c.speciesId)
    expect(HERO_CELLS.acts.map((act) => heroAtlasOfAct(act)?.cells)).toEqual(
      HERO_CELLS.acts.map(() => order),
    )
  })

  it('packs only hero species', () => {
    const heroes = new Set(MATERIALS.materials.filter((m) => m.hero).map((m) => m.id))
    expect(HERO_ATLASES.flatMap((atlas) => atlas.cells).filter((id) => !heroes.has(id))).toEqual([])
  })

  it('refuses a species that is no hero, an act listed twice and more than 16 cells', () => {
    const notHero = MATERIALS.materials.find((m) => !m.hero)?.id ?? 'missing'
    const crowded = Array.from({ length: 17 }, (_, at) => `hero-${at}`)
    expect(
      heroAtlasRowProblems([
        { act: 'fire', cells: [notHero] },
        { act: 'fire', cells: [] },
      ]),
    ).toEqual(['fire has two atlases', `fire packs ${notHero}, which is no hero species`])
    expect(() => loadHeroAtlases([{ act: 'frost', cells: crowded }])).toThrow(
      /frost packs 17 heroes, over the 16 cells/,
    )
  })

  it('hands every planet of an act one atlas object, so a planet change inside it swaps nothing', () => {
    expect(heroAtlasOfAct('foothold.heavy')).toBe(heroAtlasOfAct('foothold.heavy'))
    expect(heroAtlasOfAct('fire')).toBe(null)
  })

  it('ships each atlas as one 1024 px ETC1S sRGB map of four levels, within 2 MiB resident', () => {
    for (const atlas of HERO_ATLASES) {
      const drawn = drawnHeroAtlasOf(atlas, SHIPPED_ART)
      expect(drawn, atlas.id).not.toBe(null)
      const bytes = shippedBytesOf(drawn?.albedo ?? '')
      expect(readKtx2Header(bytes)).toEqual({
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
  })
})
