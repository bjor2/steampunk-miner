import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HERO_ATLAS_CELL_PX,
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
// the order the #452 art packs it per act (ticket 744: the legacy four, then P2's three gems in the
// foothold.heavy atlas), each cell shipped as a 256 px RGBA cell, and each shipped atlas one
// 1024 px ETC1S map within 2 MiB.

const REPO = new URL('../../../../../', import.meta.url)
const ART = new URL('docs/art/ore-heroes/', REPO)

interface HeroCellTable {
  atlases: { act: string; cells: { index: number; speciesId: string }[] }[]
  heroes: { speciesId: string; cell: string }[]
}

const HERO_CELLS = JSON.parse(
  readFileSync(new URL('hero-cells.json', ART), 'utf8'),
) as HeroCellTable
const HERO_CELL_PX = HERO_ATLAS_CELL_PX
/** PNG colour type 6: RGB with the mask in alpha. */
const RGBA_COLOUR_TYPE = 6

/** Width, height and colour type from a PNG's IHDR chunk. */
function pngHeaderOf(path: string) {
  const bytes = readFileSync(new URL(path, ART))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] }
}

const shippedBytesOf = (path: string) =>
  new Uint8Array(readFileSync(new URL(`public/${path}`, REPO)))

describe('hero atlases (ticket 451)', () => {
  it('names each atlas asset from its act under the ground category', () => {
    expect(heroAtlasAssetIdOf('foothold.base')).toBe('ground-hero-atlas-foothold-base')
    expect(heroAtlasOfAct('foothold.heavy')?.assetId).toBe('ground-hero-atlas-foothold-heavy')
  })

  it("packs the #452 cells of every act the art packs, in that act's order", () => {
    const orderOf = (atlas: HeroCellTable['atlases'][number]) =>
      [...atlas.cells].sort((a, b) => a.index - b.index).map((cell) => cell.speciesId)
    expect(HERO_CELLS.atlases.map((atlas) => heroAtlasOfAct(atlas.act)?.cells)).toEqual(
      HERO_CELLS.atlases.map(orderOf),
    )
  })

  it("packs P2's three gems after the legacy four in the foothold.heavy atlas alone (ticket 744)", () => {
    const legacy = heroAtlasOfAct('foothold.base')?.cells ?? []
    expect(legacy).toHaveLength(4)
    expect(heroAtlasOfAct('foothold.heavy')?.cells).toEqual([...legacy, 'p2-r1', 'p2-r2', 'p2-r4'])
  })

  it('ships every packed species as a 256 px RGBA cell', () => {
    const packed = new Set(HERO_ATLASES.flatMap((atlas) => atlas.cells))
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
