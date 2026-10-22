import { beforeAll, describe, expect, it } from 'vitest'
import {
  freshPlanetParamsFor,
  P2_OWN_KINDS_ORE_RULES,
  planetParamsFor,
} from '../../systems/world/planetParams'
import { familyOfCellCode, rarityTiers } from '../ores'
import { NAMED_SEEDS, planetCensusOf, type CensusRow, type PlanetCensus } from './rosterFixtures'
import { planetSpeciesOf } from './systems/planetSpecies'

// Ticket 709 (GD ruling (A) on #709, Systems and both Scalers agreeing): P2 entered under ore rules
// 9 draws three own kinds, Cinnabar on metal uncommon and Aquamarine and Jet on crystal rare, in
// bands 4 and 5. They split their tier's patches by the uniform draw, so every cell keeps its
// family, tier, ore id and density: band money, P2's trip income and p* stay exactly as rules 8 made
// them, and only the kind slot of those patches moves. The #647 lock's 5-seed check: on five seeds
// the masked cells, so the #448 density and every band's per-tier counts and rarity shares, are the
// rules-8 planet's. A whole planet takes 2 to 4 s, so the ten take about half a minute.

const FIVE_SEEDS = NAMED_SEEDS.slice(0, 5)
const PLANETS_TIMEOUT_MS = 300_000
/** Roster slots 13 to 15: the pool's own slots, after the 12 shared legacy slots. */
const OWN_KIND_SLOTS = [13, 14, 15]
const OWN_BANDS = [4, 5]
const OWN_KINDS = ['4 metal uncommon', '4 crystal rare', '5 metal uncommon', '5 crystal rare']

interface SeedCensus {
  seed: number
  fresh: PlanetCensus
  before: PlanetCensus
}

function censusOfSeed(seed: number): SeedCensus {
  return {
    seed,
    fresh: planetCensusOf(freshPlanetParamsFor(seed, 2)),
    before: planetCensusOf(planetParamsFor(seed, 2, P2_OWN_KINDS_ORE_RULES - 1)),
  }
}

function rarityOf(row: CensusRow): string | undefined {
  return rarityTiers()[row.tierOffset - (row.band - 1)]?.id
}

function kindOf(row: CensusRow): string {
  return `${row.band} ${familyOfCellCode(row.family)?.id} ${rarityOf(row)}`
}

function isOwnKindRow(row: CensusRow): boolean {
  return OWN_KIND_SLOTS.includes(row.kindSlot)
}

/** The rows the own kinds could never touch: bands 1 to 3 and the tiers they are not drawn on. */
function untouchedRowsOf(rows: readonly CensusRow[]): CensusRow[] {
  const touched = ['metal uncommon', 'crystal rare']
  return rows.filter(
    (row) => !OWN_BANDS.includes(row.band) || !touched.some((kind) => kindOf(row).endsWith(kind)),
  )
}

function cellsOfSlot(censuses: readonly SeedCensus[], kindSlot: number): number {
  return censuses
    .flatMap(({ fresh }) => fresh.rows)
    .filter((row) => row.kindSlot === kindSlot)
    .reduce((sum, row) => sum + row.cells, 0)
}

describe("planet 2's own kinds", () => {
  const censuses: SeedCensus[] = []

  beforeAll(() => {
    censuses.push(...FIVE_SEEDS.map(censusOfSeed))
  }, PLANETS_TIMEOUT_MS)

  it('enters a fresh planet 2 under the own kinds rules, its slots 13 to 15 Cinnabar, Aquamarine and Jet', () => {
    const fresh = freshPlanetParamsFor(FIVE_SEEDS[0], 2)
    const before = planetParamsFor(FIVE_SEEDS[0], 2, P2_OWN_KINDS_ORE_RULES - 1)
    expect(fresh.oreRulesVersion).toBe(P2_OWN_KINDS_ORE_RULES)
    expect(OWN_KIND_SLOTS.map((slot) => planetSpeciesOf(fresh, slot)?.epithet)).toEqual([
      'Cinnabar',
      'Aquamarine',
      'Jet',
    ])
    expect(OWN_KIND_SLOTS.map((slot) => planetSpeciesOf(before, slot))).toEqual([null, null, null])
  })

  it('reads the same cells, kind slot aside, as the rules before on five seeds: family, tier, ore and density stay', () => {
    const moved = censuses.filter(({ fresh, before }) => fresh.maskedDigest !== before.maskedDigest)
    expect(moved.map(({ seed }) => seed)).toEqual([])
  })

  it('draws the own kinds only on metal uncommon and crystal rare patches of bands 4 and 5', () => {
    const strays = censuses
      .flatMap(({ fresh }) => fresh.rows.filter(isOwnKindRow))
      .filter((row) => !OWN_KINDS.includes(kindOf(row)))
    expect(strays).toEqual([])
  })

  it('draws each own kind on the five seeds', () => {
    const cells = OWN_KIND_SLOTS.map((slot) => cellsOfSlot(censuses, slot))
    expect(cells.map((count) => count > 0)).toEqual([true, true, true])
  })

  it('keeps every kind slot of bands 1 to 3 and of the tiers the own kinds skip as before', () => {
    for (const { seed, fresh, before } of censuses) {
      expect(untouchedRowsOf(fresh.rows), `seed ${seed}`).toEqual(untouchedRowsOf(before.rows))
    }
  })
})
