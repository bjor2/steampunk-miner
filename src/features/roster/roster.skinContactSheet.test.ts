import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { readAuthorityState } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { kindLookTableOf, LOOK_VECTOR, rarityLeadOfEntry } from '../../systems/render/kindLookTable'
import { drawnHeroAtlasOf } from '../../systems/render/heroAtlas'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { ORE_ROWS } from '../ores'
import { NAMED_SEEDS } from './rosterFixtures'
import {
  heroAtlasOfPlanet,
  planetKindLooksOf,
  rarityLooksByLead,
  ROSTER_KIND_LOOK,
} from './systems/render/kindLookProvider'
import {
  GEM_READ_SCREENS,
  gemReadProblemsOf,
  heroReadOf,
  priceOrderProblemsOf,
  type HeroReads,
} from './systems/render/gemRead'
import {
  planetContactSheetOf,
  unreadablePairsOf,
  type ContactSheetRow,
} from './systems/render/skinContactSheet'
import golden from './skinContactSheet.golden.json'

// Ticket 746's contact sheet (#647 done-when 1, the HS's distinct-sprite test on #741): every kind
// of P1 to P5 as the terrain draws it on frame 1, undrilled, each row against its planet's other
// rows. The browser half, at 360x640 and 1280x800, is `e2e/browser/skinContactSheet.spec.ts`.
// Ticket 785 (the GD lock and addendum on #746) gives every gem of P1 to P5 a hero cell and reads
// it from the pipeline's measures of the committed cells (`docs/art/ore-heroes/hero-reads.json`):
// a faceted outline and a highlight at both screens, and Systems' price-order score.

const SHEET_PLANETS = [1, 2, 3, 4, 5]
const [SEED, SECOND_SEED] = NAMED_SEEDS
/** P2's incoming kinds under ore rules 9 (ticket 736): Azurite Nodule, Pyrite Sun, Argentite. */
const P2_INCOMING = ['p2-u1b', 'p2-u2b', 'p2-r3b']
const PUBLIC = new URL('../../../public/', import.meta.url)
const ORE_HEROES_ART = new URL('../../../docs/art/ore-heroes/', import.meta.url)
const GEM_RANKS = ORE_ROWS.gems.tierLeads.map((_, rank) => rank)
/** The pipeline's measures of every committed hero cell at the two gem-read screens (ticket 785). */
const HERO_READS = JSON.parse(
  readFileSync(new URL('hero-reads.json', ORE_HEROES_ART), 'utf8'),
) as HeroReads

function sheetOf(planetIndex: number, seed = SEED) {
  return planetContactSheetOf(freshPlanetParamsFor(seed, planetIndex))
}

function goldenRowsOf(planetIndex: number) {
  return golden.planets.find((planet) => planet.planetIndex === planetIndex)?.rows ?? []
}

function gemRowsOf(planetIndex: number) {
  return sheetOf(planetIndex).rows.filter((row) => row.gemRank !== null)
}

function goldenGemRowsOf(planetIndex: number) {
  return goldenRowsOf(planetIndex).filter((row) => row.gemRank !== null)
}

function cellSha256Of(speciesId: string): string {
  const bytes = readFileSync(new URL(`cells/${speciesId}.png`, ORE_HEROES_ART))
  return createHash('sha256').update(bytes).digest('hex')
}

function bySaleTier(a: ContactSheetRow, b: ContactSheetRow): number {
  return (a.gemSaleTier ?? 0) - (b.gemSaleTier ?? 0)
}

describe('skin contact sheet of P1 to P5 (ticket 746)', () => {
  beforeEach(() => resetGameStore())

  it.each(SHEET_PLANETS)('skins every kind slot of a fresh planet %i', (planetIndex) => {
    const sheet = sheetOf(planetIndex)
    expect(sheet.unskinned).toEqual([])
    expect(sheet.rows.length).toBeGreaterThan(0)
  })

  it.each(SHEET_PLANETS)(
    'draws no rarity on any kind of planet %i before the first cut (ticket 698)',
    (planetIndex) => {
      const state = readAuthorityState()
      const { playerId } = useGameStore.getState()
      const looks = planetKindLooksOf(freshPlanetParamsFor(SEED, planetIndex))
      const table = kindLookTableOf(looks, rarityLooksByLead(), (look) =>
        ROSTER_KIND_LOOK.hasSeenKind(state, playerId, look.speciesId),
      )
      const leads = looks.map((_, at) => rarityLeadOfEntry(table.kinds[at * LOOK_VECTOR + 3]))
      expect(table.revealedSlots).toBe(sheetOf(planetIndex).rows.length)
      expect(new Set(leads)).toEqual(new Set([0]))
    },
  )

  it.each(SHEET_PLANETS)(
    'tells every kind of planet %i apart from each of its other kinds',
    (planetIndex) => {
      expect(unreadablePairsOf(sheetOf(planetIndex))).toEqual([])
    },
  )

  it.each(SHEET_PLANETS)('draws planet %i as the committed contact sheet', (planetIndex) => {
    expect(sheetOf(planetIndex).rows).toEqual(goldenRowsOf(planetIndex))
  })

  it.each(SHEET_PLANETS)('draws planet %i alike for every seed', (planetIndex) => {
    expect(sheetOf(planetIndex, SECOND_SEED)).toEqual(sheetOf(planetIndex))
  })

  it('lists a pair sharing two of silhouette, pattern and colour, or one hero cell', () => {
    const [first, second, third] = sheetOf(1).rows
    const sheet = {
      planetIndex: 1,
      unskinned: [],
      rows: [
        first,
        { ...second, silhouetteCode: first.silhouetteCode, patternCode: first.patternCode },
        { ...third, heroCell: 0 },
        { ...first, speciesId: 'hero-twin', silhouetteCode: 0, patternCode: 0, heroCell: 0 },
      ],
    }
    expect(unreadablePairsOf(sheet)).toEqual([
      `P1 ${first.speciesId} vs ${second.speciesId}`,
      `P1 ${third.speciesId} vs hero-twin`,
    ])
  })

  it('draws every hero cell of the sheet from an atlas map that ships, so a missing one fails', () => {
    const planetsDrawingCells = SHEET_PLANETS.filter((planetIndex) =>
      sheetOf(planetIndex).rows.some((row) => row.heroCell !== null),
    )
    const maps = planetsDrawingCells.map(
      (planetIndex) => drawnHeroAtlasOf(heroAtlasOfPlanet(planetIndex), SHIPPED_ART)?.albedo,
    )
    expect(planetsDrawingCells).toEqual(SHEET_PLANETS)
    expect(maps.filter((map) => map === undefined || !existsSync(new URL(map, PUBLIC)))).toEqual([])
  })

  it("holds P2's incoming Pyrite Sun, Azurite Nodule and Argentite on the sheet", () => {
    const ids = sheetOf(2).rows.map((row) => row.speciesId)
    expect(ids).toEqual(expect.arrayContaining(P2_INCOMING))
  })

  it.each(SHEET_PLANETS)('names each gem rank of planet %i once', (planetIndex) => {
    const ranks = sheetOf(planetIndex).rows.flatMap((row) =>
      row.gemRank === null ? [] : [row.gemRank],
    )
    expect([...ranks].sort((a, b) => a - b)).toEqual(GEM_RANKS)
  })

  it.each(SHEET_PLANETS)(
    'ranks the gems of planet %i by sale value, so k never falls as the price rises',
    (planetIndex) => {
      const byPrice = gemRowsOf(planetIndex).sort(bySaleTier)
      const tiers = byPrice.map((row) => row.gemSaleTier)
      expect(byPrice.map((row) => row.gemRank)).toEqual(GEM_RANKS)
      expect(new Set(tiers).size).toBe(tiers.length)
    },
  )

  it.each(SHEET_PLANETS)(
    'draws every gem of planet %i a hero cell of its own that no non-gem shares (ticket 785)',
    (planetIndex) => {
      const gems = gemRowsOf(planetIndex)
      const nonGemCells = sheetOf(planetIndex).rows.flatMap((row) =>
        row.gemRank === null && row.heroCell !== null ? [row.heroCell] : [],
      )
      expect(gems.filter((row) => row.heroCell === null)).toEqual([])
      expect(gems.filter((row) => nonGemCells.includes(row.heroCell ?? -1))).toEqual([])
    },
  )

  it('measures every committed hero cell as it is on disk, so a stale read fails', () => {
    const stale = HERO_READS.heroes.filter(
      (hero) => hero.cellSha256 !== cellSha256Of(hero.speciesId),
    )
    expect(stale.map((hero) => hero.speciesId)).toEqual([])
    expect(Object.keys(HERO_READS.screens).sort()).toEqual([...GEM_READ_SCREENS].sort())
  })

  for (const planetIndex of SHEET_PLANETS) {
    for (const row of goldenGemRowsOf(planetIndex)) {
      it(`reads ${row.name} on planet ${planetIndex} as a gem on frame 1: a faceted hero cell with a highlight, apart from every non-gem, at 360 px and 1280+ (ticket 785)`, () => {
        const drawn = sheetOf(planetIndex).rows.find(
          (sheetRow) => sheetRow.speciesId === row.speciesId,
        )
        expect(drawn?.heroCell).not.toBeNull()
        const read = heroReadOf(HERO_READS, row.speciesId)
        expect(read).not.toBeNull()
        expect(read === null ? ['unmeasured'] : gemReadProblemsOf(read)).toEqual([])
        expect(
          unreadablePairsOf(sheetOf(planetIndex)).filter((pair) => pair.includes(row.speciesId)),
        ).toEqual([])
      })
    }
  }

  it.each(SHEET_PLANETS)(
    'scores no cheaper gem of planet %i above a pricier one, nor under its top non-gem ore, on k plus its share of bright or saturated pixels (ticket 785)',
    (planetIndex) => {
      const problems = GEM_READ_SCREENS.flatMap((screen) =>
        priceOrderProblemsOf(sheetOf(planetIndex), HERO_READS, screen),
      )
      expect(problems).toEqual([])
    },
  )

  it.todo(
    "steps each gem's glint with its rank k, glintStep == gemRank, alike on every planet (#786)",
  )
})
