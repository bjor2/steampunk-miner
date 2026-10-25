import { describe, expect, it } from 'vitest'
import { HERO_ATLAS_CELLS } from '../../../constants/scene'
import { heroAtlasProblems } from '../../../systems/render/heroAtlas'
import { GENERATED_POOLS_ORE_RULES, ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import cutsFile from '../gemCuts.json'
import {
  cutsUnder,
  GEM_CUT_ATLAS_ASSET,
  GEM_CUT_LIBRARY,
  gemCutArtAssets,
  gemCutLibraryProblems,
  gemCutOf,
  gemCutPagesOf,
  loadGemCutLibrary,
} from './gemCutLibrary'

// Ticket 889 (ME of the GD's Materials Expansion lock of 25 Oct): about 24 cuts, append-only, each
// its own cell on the library's hue-tinted pages, gated by the ore rules version it arrived under.

const LIBRARY_SIZE_LEAST = 20

function fileWith(cuts: unknown[]): Record<string, unknown> {
  return { ...cutsFile, cuts }
}

function appended(row: Record<string, unknown>): Record<string, unknown> {
  return fileWith([...cutsFile.cuts, row])
}

describe('gem-cut library (ticket 889)', () => {
  it('ships about 24 cuts, every one drawable under the current ore rules', () => {
    expect(gemCutLibraryProblems(cutsFile)).toEqual([])
    expect(GEM_CUT_LIBRARY.cuts.length).toBeGreaterThanOrEqual(LIBRARY_SIZE_LEAST)
    expect(cutsUnder(ORE_RULES_VERSION)).toEqual(GEM_CUT_LIBRARY.cuts)
    expect(cutsUnder(GENERATED_POOLS_ORE_RULES - 1)).toEqual([])
    expect(cutsUnder(undefined)).toEqual([])
  })

  it('lays the cuts on hue-tinted pages of 16 in library order, each page its own atlas asset', () => {
    const pages = gemCutPagesOf()
    expect(pages.length).toBe(Math.ceil(GEM_CUT_LIBRARY.cuts.length / HERO_ATLAS_CELLS))
    expect(pages.every((page) => page.isHueTinted)).toBe(true)
    expect(pages.flatMap((page) => page.cells)).toEqual(GEM_CUT_LIBRARY.cuts.map((cut) => cut.id))
    expect(pages.map((page) => page.assetId)).toEqual([
      GEM_CUT_ATLAS_ASSET,
      `${GEM_CUT_ATLAS_ASSET}-page-2`,
    ])
    expect(heroAtlasProblems({ id: 'gem-cuts', pages })).toEqual([])
    expect(gemCutArtAssets()).toEqual(
      pages.map((page) => ({ id: page.assetId, category: 'ground' })),
    )
  })

  it('finds a cut by id, and none for a name', () => {
    expect(gemCutOf('gem-cut.brilliant')?.name).toBe('Brilliant')
    expect(gemCutOf('Brilliant')).toBeNull()
  })

  it('gates an appended cut behind the ore rules version it names, so older stamps never see it', () => {
    const later = loadGemCutLibrary(
      appended({
        id: 'gem-cut.late',
        name: 'Late',
        since: ORE_RULES_VERSION + 1,
        shape: 'a stone',
      }),
    )
    expect(cutsUnder(ORE_RULES_VERSION, later)).toEqual(GEM_CUT_LIBRARY.cuts)
    expect(cutsUnder(ORE_RULES_VERSION + 1, later).map((cut) => cut.id)).toContain('gem-cut.late')
  })

  it('refuses a cut whose since falls below the cut before it, since a cut is only ever appended', () => {
    expect(
      gemCutLibraryProblems(appended({ id: 'gem-cut.x', name: 'X', since: 13, shape: 'a stone' })),
    ).toEqual([
      'cuts[24].since must be an ore rules version from 14',
      'cuts[24].since falls below the cut before it; a cut is only ever appended',
    ])
    const [first, ...rest] = cutsFile.cuts
    expect(gemCutLibraryProblems(fileWith([{ ...first, since: 15 }, ...rest]))).toEqual([
      'cuts[1].since falls below the cut before it; a cut is only ever appended',
    ])
  })

  it('refuses an id outside gem-cut.<kebab-name>, a repeated id or name, and an unknown field', () => {
    expect(
      gemCutLibraryProblems(
        appended({ id: 'brilliant', name: 'Brilliant', since: 14, shape: 's' }),
      ),
    ).toEqual(['cuts[24].id must be gem-cut.<kebab-name>', 'two cuts share the name Brilliant'])
    expect(
      gemCutLibraryProblems(
        appended({ id: 'gem-cut.brilliant', name: 'Again', since: 14, shape: 's', cell: 3 }),
      ),
    ).toEqual(['cuts[24] has the unknown field cell', 'two cuts share the id gem-cut.brilliant'])
    expect(gemCutLibraryProblems(fileWith([]))).toEqual(['cuts must be a list of at least one cut'])
    expect(() => loadGemCutLibrary(fileWith([]))).toThrow('gemCuts.json is refused')
  })
})
