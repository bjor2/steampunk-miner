import { beforeAll, describe, expect, it } from 'vitest'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import { add, cmp, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../../systems/money'
import {
  freshPlanetParamsFor,
  P1_GEMS_ORE_RULES,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { familyOfCellCode, rarityTiers } from '../ores'
import { NAMED_SEEDS, planetCensusOf, type CensusRow, type PlanetCensus } from './rosterFixtures'
import { rosterKindOf } from './systems/planetRoster'
import { planetSpeciesOf } from './systems/planetSpecies'
import { gemSaleTierOfKind } from './systems/rosterGems'

// Ticket 713 (GD lock on #713, Bjor's approval of 22 Oct, Systems' rows and the HS and VS input):
// P1 entered under ore rules 12 draws three gems, Diamond, Emerald and Ruby, on its crystal rare
// patches of bands 3 to 5 (d >= 0.35), 4:3:2 per cluster, with one guaranteed cluster of each.
// Systems' binding cap: the gems add at most 15% of P1's ore pool value, averaged over 3 seeds, and
// hold at most 0.5% of its ore cells (HS). Commons, uncommons and bands 1 and 2 keep every cell, so
// P1 keeps its first-trip non-common and the gems never count toward it. A whole P1 takes about a
// second, so the six take a few.

const THREE_SEEDS = NAMED_SEEDS.slice(0, 3)
const PLANETS_TIMEOUT_MS = 120_000
/** Roster slots 13 to 15: P1's own slots, after the 12 shared legacy slots. */
const GEM_KIND_SLOTS = [13, 14, 15]
const GEM_BANDS = [3, 4, 5]
const POOL_VALUE_CAP_PERCENT = 15
const CELL_CAP_BP = 50
const BASIS_POINTS = 10000
const PERCENT = 100

interface SeedCensus {
  seed: number
  params: PlanetParams
  fresh: PlanetCensus
  before: PlanetCensus
}

function censusOfSeed(seed: number): SeedCensus {
  const params = planetParamsFor(seed, 1, P1_GEMS_ORE_RULES)
  return {
    seed,
    params,
    fresh: planetCensusOf(params),
    before: planetCensusOf(planetParamsFor(seed, 1, P1_GEMS_ORE_RULES - 1)),
  }
}

function isGemRow(row: CensusRow): boolean {
  return GEM_KIND_SLOTS.includes(row.kindSlot)
}

function kindOf(row: CensusRow): string {
  const rarity = rarityTiers()[row.tierOffset - (row.band - 1)]?.id
  return `${familyOfCellCode(row.family)?.id} ${rarity}`
}

/** The rows the gems could never touch: bands 1 and 2 and every tier but crystal rare. */
function untouchedRowsOf(rows: readonly CensusRow[]): CensusRow[] {
  return rows.filter((row) => !GEM_BANDS.includes(row.band) || kindOf(row) !== 'crystal rare')
}

/** What a census row's cells sell for: a gem at its own tier, any other cell at its own. */
function rowValueOf(params: PlanetParams, row: CensusRow): Money {
  const gemTier = gemSaleTierOfKind(params, rosterKindOf(params, row.kindSlot))
  const tier = gemTier ?? oreTier(params.planetIndex, 1) + row.tierOffset
  return mul(oreSalePrice(tier), fromSafeInteger(row.cells))
}

function valueOf(params: PlanetParams, rows: readonly CensusRow[]): Money {
  return rows.reduce((sum, row) => add(sum, rowValueOf(params, row)), ZERO_MONEY)
}

function cellsOf(rows: readonly CensusRow[]): number {
  return rows.reduce((sum, row) => sum + row.cells, 0)
}

describe("planet 1's gems", () => {
  const censuses: SeedCensus[] = []

  beforeAll(() => {
    censuses.push(...THREE_SEEDS.map(censusOfSeed))
  }, PLANETS_TIMEOUT_MS)

  it('enters a fresh planet 1 under the gem rules, its slots 13 to 15 Diamond, Emerald and Ruby', () => {
    const fresh = freshPlanetParamsFor(THREE_SEEDS[0], 1)
    const before = planetParamsFor(THREE_SEEDS[0], 1, P1_GEMS_ORE_RULES - 1)
    expect(fresh.oreRulesVersion).toBeGreaterThanOrEqual(P1_GEMS_ORE_RULES)
    expect(GEM_KIND_SLOTS.map((slot) => planetSpeciesOf(fresh, slot)?.epithet)).toEqual([
      'Diamond',
      'Emerald',
      'Ruby',
    ])
    expect(GEM_KIND_SLOTS.map((slot) => planetSpeciesOf(before, slot))).toEqual([null, null, null])
  })

  it('draws the gems only on crystal rare cells of bands 3 to 5', () => {
    const strays = censuses
      .flatMap(({ fresh }) => fresh.rows.filter(isGemRow))
      .filter((row) => !GEM_BANDS.includes(row.band) || kindOf(row) !== 'crystal rare')
    expect(strays).toEqual([])
  })

  it('holds at least one cluster of each gem on every seed', () => {
    const held = censuses.map(({ fresh }) =>
      GEM_KIND_SLOTS.map((slot) => fresh.rows.some((row) => row.kindSlot === slot)),
    )
    expect(held).toEqual(THREE_SEEDS.map(() => [true, true, true]))
  })

  it('keeps every cell of bands 1 and 2 and of every tier but crystal rare as the rules before made it', () => {
    for (const { seed, fresh, before } of censuses) {
      expect(untouchedRowsOf(fresh.rows), `seed ${seed}`).toEqual(untouchedRowsOf(before.rows))
    }
  })

  it("adds at most 15% of P1's ore pool value in gems over the three seeds", () => {
    const gemValue = censuses.reduce(
      (sum, { params, fresh }) => add(sum, valueOf(params, fresh.rows.filter(isGemRow))),
      ZERO_MONEY,
    )
    const poolValue = censuses.reduce(
      (sum, { params, before }) => add(sum, valueOf(params, before.rows)),
      ZERO_MONEY,
    )
    const cap = mul(poolValue, fromSafeInteger(POOL_VALUE_CAP_PERCENT))
    expect(cmp(mul(gemValue, fromSafeInteger(PERCENT)), cap)).toBeLessThanOrEqual(0)
  })

  it("holds at most 0.5% of P1's ore cells in gems on every seed", () => {
    const overCap = censuses.filter(
      ({ fresh }) =>
        cellsOf(fresh.rows.filter(isGemRow)) * BASIS_POINTS > cellsOf(fresh.rows) * CELL_CAP_BP,
    )
    expect(overCap.map(({ seed }) => seed)).toEqual([])
  })
})
