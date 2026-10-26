import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kindLookProvider } from '../../systems/registries/kindLook'
import { gemGlintOfCode } from '../../systems/render/gemGlint'
import { firstHueTintedCellOf, heroCellsOf } from '../../systems/render/heroAtlas'
import {
  gemGlintCodeOfEntry,
  heroCellOfEntry,
  kindLookTableOf,
  LOOK_VECTOR,
} from '../../systems/render/kindLookTable'
import { planetParamsAt } from '../../systems/starMap/systemPlanetParams'
import {
  freshPlanetParamsFor,
  ORE_RULES_VERSION,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { GEM_CUT_LIBRARY, gemCutPagesOf } from '../gem-cuts'
import { GEM_OVERLAYS } from '../../systems/render/gemOverlays'
import {
  gemReadProblemsAt,
  priceOrderProblemsOf,
  type HeroCellRead,
  type HeroReads,
} from './systems/render/gemRead'
import {
  gemOverlayOfPlanet,
  heroAtlasOfPlanet,
  planetKindLooksOf,
  rarityLooksByLead,
} from './systems/render/kindLookProvider'
import {
  planetContactSheetOf,
  unreadablePairsOf,
  type ContactSheetRow,
  type PlanetContactSheet,
} from './systems/render/skinContactSheet'

// Ticket 889 (ME of the GD's Materials Expansion lock of 25 Oct): on every planet after P5 the
// three gems draw a cut of the append-only Blender library, each its own silhouette, faceted with
// a highlight (#785's gem-read rule) at 24 px, 360 px and 1280+, coloured by the gem's hue and
// under one planet overlay chosen from data by (s, p). Only the reopening of #746, for gems only.

const SEED = 20261024
const GEMS_PER_PLANET = 3
const READ_SCREENS = ['640x360', '360x640', '1280x800']
const GEM_CUTS_ART = new URL('../../../docs/art/gem-cuts/', import.meta.url)

interface CutRead {
  cutId: string
  cellSha256: string
  screens: HeroCellRead['screens']
  dimmestTint: HeroCellRead['screens']
}

/** The pipeline's measures of every committed cut cell (`cut_post.py`). */
const CUT_READS = JSON.parse(readFileSync(new URL('gem-cut-reads.json', GEM_CUTS_ART), 'utf8')) as {
  screens: Record<string, number>
  cuts: CutRead[]
}

/** The addresses read: system 1's P6 to P40, system 2's first and third planets, g = 1e6. */
const ADDRESSES: { label: string; params: PlanetParams }[] = [
  ...[6, 7, 8, 20, 40].map((place) => ({
    label: `1.${place}`,
    params: freshPlanetParamsFor(SEED, place),
  })),
  { label: '2.1', params: planetParamsAt(SEED, 2n, 6, ORE_RULES_VERSION) },
  { label: '2.3', params: planetParamsAt(SEED, 2n, 8, ORE_RULES_VERSION) },
  { label: '200000.1e6', params: planetParamsAt(SEED, 200_000n, 1_000_000, ORE_RULES_VERSION) },
]

function gemRowsOf(sheet: PlanetContactSheet): ContactSheetRow[] {
  return sheet.rows.filter((row) => row.gemRank !== null)
}

function cutReadOf(cutId: string): CutRead {
  const read = CUT_READS.cuts.find((cut) => cut.cutId === cutId)
  if (read === undefined) throw new Error(`${cutId} has no read in gem-cut-reads.json`)
  return read
}

/** The cut reads keyed by the species that draws each, so the price-order rule can read them. */
function readsOfSheet(sheet: PlanetContactSheet): HeroReads {
  return {
    screens: CUT_READS.screens,
    heroes: gemRowsOf(sheet).map((row) => ({
      ...cutReadOf(row.gemCut ?? ''),
      speciesId: row.speciesId,
    })),
  }
}

function cellSha256Of(cutId: string): string {
  const name = cutId.split('.', 2)[1]
  const bytes = readFileSync(new URL(`cells/${name}.png`, GEM_CUTS_ART))
  return createHash('sha256').update(bytes).digest('hex')
}

function firstTintedCellOf(params: PlanetParams): number {
  const first = firstHueTintedCellOf(heroAtlasOfPlanet(params.planetIndex)?.pages ?? [])
  if (first === null) throw new Error(`planet ${params.planetIndex} has no hue-tinted page`)
  return first
}

describe('generated gem cuts (ticket 889)', () => {
  it.each(ADDRESSES)(
    'draws the three gems of $label from three different library cuts on the hue-tinted pages, no non-gem drawing a cell',
    ({ params }) => {
      const sheet = planetContactSheetOf(params)
      const gems = gemRowsOf(sheet)
      const first = firstTintedCellOf(params)
      expect(gems).toHaveLength(GEMS_PER_PLANET)
      for (const gem of gems) {
        expect(GEM_CUT_LIBRARY.cuts.map((cut) => cut.id)).toContain(gem.gemCut)
        expect(gem.heroCell).not.toBeNull()
        expect(gem.heroCell ?? -1).toBeGreaterThanOrEqual(first)
      }
      expect(new Set(gems.map((gem) => gem.gemCut)).size).toBe(GEMS_PER_PLANET)
      expect(sheet.rows.filter((row) => row.gemRank === null && row.heroCell !== null)).toEqual([])
      expect(unreadablePairsOf(sheet)).toEqual([])
    },
  )

  it.each(ADDRESSES)(
    "packs $label's gem cells into the look table over their rank glint, glintStep == gemRank, and no other kind",
    ({ params }) => {
      const atlas = heroAtlasOfPlanet(params.planetIndex)
      const table = kindLookTableOf(
        planetKindLooksOf(params),
        rarityLooksByLead(),
        () => false,
        heroCellsOf(atlas?.pages ?? []),
      )
      const rows = planetContactSheetOf(params).rows
      const fourth = (row: ContactSheetRow) => table.kinds[(row.slot - 1) * LOOK_VECTOR + 3]
      expect(rows.map((row) => heroCellOfEntry(fourth(row)))).toEqual(
        rows.map((row) => row.heroCell),
      )
      expect(
        rows.map((row) => gemGlintOfCode(gemGlintCodeOfEntry(fourth(row)))?.step ?? null),
      ).toEqual(rows.map((row) => row.gemRank))
    },
  )

  it.each(ADDRESSES)(
    'lays one overlay of the catalogue over $label, chosen from data by its address',
    ({ params }) => {
      const overlay = gemOverlayOfPlanet(params)
      expect(overlay).not.toBeNull()
      expect(GEM_OVERLAYS.overlays).toContainEqual(overlay)
      expect(kindLookProvider()?.gemOverlayOf(params)).toEqual(overlay)
    },
  )

  it('measures every committed cut cell as it is on disk, so a stale read fails', () => {
    expect(CUT_READS.cuts.map((cut) => cut.cutId)).toEqual(
      GEM_CUT_LIBRARY.cuts.map((cut) => cut.id),
    )
    const stale = CUT_READS.cuts.filter((cut) => cut.cellSha256 !== cellSha256Of(cut.cutId))
    expect(stale.map((cut) => cut.cutId)).toEqual([])
    expect(Object.keys(CUT_READS.screens).sort()).toEqual([...READ_SCREENS].sort())
    expect(CUT_READS.screens['640x360']).toBe(24)
  })

  for (const cut of GEM_CUT_LIBRARY.cuts) {
    it(`reads ${cut.name} as a gem at 24 px, 360 px and 1280+: a faceted cell with a highlight, neutral and in the dimmest hue (ticket 889)`, () => {
      const read = cutReadOf(cut.id)
      const neutral: HeroCellRead = {
        speciesId: cut.id,
        cellSha256: read.cellSha256,
        screens: read.screens,
      }
      const tinted: HeroCellRead = { ...neutral, screens: read.dimmestTint }
      expect(gemReadProblemsAt(neutral, READ_SCREENS)).toEqual([])
      expect(gemReadProblemsAt(tinted, READ_SCREENS)).toEqual([])
    })
  }

  it.each(ADDRESSES)(
    'scores no cheaper gem of $label above a pricier one, nor under its top non-gem, on k plus the bright or saturated share',
    ({ params }) => {
      const sheet = planetContactSheetOf(params)
      const reads = readsOfSheet(sheet)
      const problems = READ_SCREENS.flatMap((screen) => priceOrderProblemsOf(sheet, reads, screen))
      expect(problems).toEqual([])
    },
  )

  it('gives system 1 P6 and system 2 p1, which share g, their own cuts or overlay', () => {
    const [p6, s2p1] = [ADDRESSES[0], ADDRESSES[5]].map(({ params }) => ({
      cuts: gemRowsOf(planetContactSheetOf(params)).map((gem) => gem.gemCut),
      overlay: gemOverlayOfPlanet(params)?.id,
    }))
    expect(p6).not.toEqual(s2p1)
  })

  it('draws no cut and lays no overlay on a P6 a save holds under ore rules 13, nor on P1 to P5', () => {
    const held = planetParamsFor(SEED, 6, 13)
    expect(planetContactSheetOf(held).rows.some((row) => row.gemCut !== undefined)).toBe(false)
    expect(gemOverlayOfPlanet(held)).toBeNull()
    for (const planet of [1, 2, 3, 4, 5]) {
      const fresh = freshPlanetParamsFor(SEED, planet)
      expect(gemOverlayOfPlanet(fresh)).toBeNull()
      expect(planetContactSheetOf(fresh).rows.some((row) => row.gemCut !== undefined)).toBe(false)
    }
  })

  it("keeps the library's pages after every act's own pages, so page-1 cells never move", () => {
    for (const { params } of ADDRESSES) {
      const pages = heroAtlasOfPlanet(params.planetIndex)?.pages ?? []
      const tinted = pages.filter((page) => page.isHueTinted)
      expect(tinted).toEqual(gemCutPagesOf())
      expect(pages.slice(pages.length - tinted.length)).toEqual(tinted)
    }
  })
})
