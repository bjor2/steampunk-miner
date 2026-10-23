import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { kindLookTableOf, LOOK_VECTOR, rarityLeadOfEntry } from '../../systems/render/kindLookTable'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { ORE_ROWS } from '../ores'
import { NAMED_SEEDS } from './rosterFixtures'
import {
  planetKindLooksOf,
  rarityLooksByLead,
  ROSTER_KIND_LOOK,
} from './systems/render/kindLookProvider'
import { planetContactSheetOf, unreadablePairsOf } from './systems/render/skinContactSheet'
import golden from './skinContactSheet.golden.json'

// Ticket 746's contact sheet (#647 done-when 1, the HS's distinct-sprite test on #741): every kind
// of P1 to P5 as the terrain draws it on frame 1, undrilled, each row against its planet's other
// rows. The browser half, at 360x640 and 1280x800, is `e2e/browser/skinContactSheet.spec.ts`.

const SHEET_PLANETS = [1, 2, 3, 4, 5]
const [SEED, SECOND_SEED] = NAMED_SEEDS
/** P2's incoming kinds under ore rules 9 (ticket 736): Azurite Nodule, Pyrite Sun, Argentite. */
const P2_INCOMING = ['p2-u1b', 'p2-u2b', 'p2-r3b']
const GEM_RANKS = ORE_ROWS.gems.tierLeads.map((_, rank) => rank)

function sheetOf(planetIndex: number, seed = SEED) {
  return planetContactSheetOf(freshPlanetParamsFor(seed, planetIndex))
}

function goldenRowsOf(planetIndex: number) {
  return golden.planets.find((planet) => planet.planetIndex === planetIndex)?.rows
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
})
