import { beforeAll, describe, expect, it } from 'vitest'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import {
  add,
  cmp,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  ZERO_MONEY,
  type Money,
} from '../../systems/money'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import { NAMED_SEEDS, planetCensusOf, type CensusRow } from './rosterFixtures'
import { rosterKindOf } from './systems/planetRoster'
import { gemSaleTierOfKind } from './systems/rosterGems'

// The gem tier of P2 to P5 (ticket 741, GD lock with Systems' final spec on #741): each planet's
// three gems are existing rare and mythic kinds, placed by #737's clusters and #738's deep window
// (bands 3 to 5, a guaranteed cluster of each), and sold at t_top + 5, 6 and 8. Done-when 1: the gem
// tier adds at most 15% of each planet's ore pool value, held by frequency alone, and P3's value
// steps up from P2 by about a usual hop, never by the 7.6 of its gems' prices. Done-when 2: R3,
// each hop at least 1.15 with the gems in. Whole planets 1 to 5 on the three pacing seeds.

const THREE_SEEDS = NAMED_SEEDS.slice(0, 3)
const PLANETS = [1, 2, 3, 4, 5]
const GEM_PLANETS = [2, 3, 4, 5]
const PLANETS_TIMEOUT_MS = 300_000
const GEM_BANDS = [3, 4, 5]
const POOL_VALUE_CAP_PERCENT = 15
const PERCENT = 100
const R3_FLOOR = fromCanonical('1.15')
/** P3's gems over P2's, five tiers up: the step the GD lock keeps P3's pool value under. */
const GEM_PRICE_STEP_P2_TO_P3 = fromCanonical('7.59375')

interface PlanetCensusOfSeed {
  seed: number
  params: PlanetParams
  rows: readonly CensusRow[]
}

function censusOf(seed: number, planet: number): PlanetCensusOfSeed {
  const params = freshPlanetParamsFor(seed, planet)
  return { seed, params, rows: planetCensusOf(params).rows }
}

function gemTierOf(params: PlanetParams, row: CensusRow): number | null {
  return gemSaleTierOfKind(params, rosterKindOf(params, row.kindSlot))
}

function isGemRow(params: PlanetParams, row: CensusRow): boolean {
  return gemTierOf(params, row) !== null
}

function cellTierOf(params: PlanetParams, row: CensusRow): number {
  return oreTier(params.planetIndex, 1) + row.tierOffset
}

/** What the rows sell for: a gem at its own tier, or every cell at its own when `asPlain`. */
function valueOf(params: PlanetParams, rows: readonly CensusRow[], asPlain = false): Money {
  return rows.reduce((sum, row) => {
    const tier = (asPlain ? null : gemTierOf(params, row)) ?? cellTierOf(params, row)
    return add(sum, mul(oreSalePrice(tier), fromSafeInteger(row.cells)))
  }, ZERO_MONEY)
}

function sumOf(values: readonly Money[]): Money {
  return values.reduce(add, ZERO_MONEY)
}

describe('the gem tier of P2 to P5 on whole planets', () => {
  /** By planet, then seed. */
  const censuses = new Map<number, PlanetCensusOfSeed[]>()
  const ofPlanet = (planet: number) => censuses.get(planet) ?? []

  beforeAll(() => {
    for (const planet of PLANETS) {
      censuses.set(
        planet,
        THREE_SEEDS.map((seed) => censusOf(seed, planet)),
      )
    }
  }, PLANETS_TIMEOUT_MS)

  it('draws every gem only in bands 3 to 5', () => {
    const strays = GEM_PLANETS.flatMap((planet) =>
      ofPlanet(planet).flatMap(({ params, rows }) =>
        rows.filter((row) => isGemRow(params, row) && !GEM_BANDS.includes(row.band)),
      ),
    )
    expect(strays).toEqual([])
  })

  it('holds at least one cluster of each of its three gems on every seed', () => {
    const gemKinds = GEM_PLANETS.map((planet) =>
      ofPlanet(planet).map(({ params, rows }) => {
        const held = new Set(rows.filter((row) => isGemRow(params, row)).map((row) => row.kindSlot))
        return held.size
      }),
    )
    expect(gemKinds).toEqual(GEM_PLANETS.map(() => THREE_SEEDS.map(() => 3)))
  })

  it("adds at most 15% of each planet's ore pool value in gems over the three seeds", () => {
    const overCap = GEM_PLANETS.filter((planet) => {
      const seeds = ofPlanet(planet)
      const gemValue = sumOf(
        seeds.map(({ params, rows }) =>
          valueOf(
            params,
            rows.filter((row) => isGemRow(params, row)),
          ),
        ),
      )
      const poolValue = sumOf(seeds.map(({ params, rows }) => valueOf(params, rows, true)))
      const cap = mul(poolValue, fromSafeInteger(POOL_VALUE_CAP_PERCENT))
      return cmp(mul(gemValue, fromSafeInteger(PERCENT)), cap) > 0
    })
    expect(overCap).toEqual([])
  })

  it('keeps every hop from P1 to P5 at least 1.15 in ore pool value, gems in, on every seed (R3)', () => {
    const short = PLANETS.slice(1).flatMap((planet) =>
      THREE_SEEDS.flatMap((seed, at) => {
        const before = ofPlanet(planet - 1)[at]
        const after = ofPlanet(planet)[at]
        const hop = div(valueOf(after.params, after.rows), valueOf(before.params, before.rows))
        return cmp(hop, R3_FLOOR) < 0 ? [{ seed, planet }] : []
      }),
    )
    expect(short).toEqual([])
  })

  it("steps P3's pool value up from P2 within the other hops' range, under its gems' 7.6", () => {
    const valueOfPlanet = (planet: number) =>
      sumOf(ofPlanet(planet).map(({ params, rows }) => valueOf(params, rows)))
    const hopTo = (planet: number) => div(valueOfPlanet(planet), valueOfPlanet(planet - 1))
    const others = [2, 4, 5].map(hopTo)
    const smallest = others.reduce((low, hop) => (cmp(hop, low) < 0 ? hop : low))
    const largest = others.reduce((high, hop) => (cmp(hop, high) > 0 ? hop : high))
    const toP3 = hopTo(3)
    expect([cmp(toP3, smallest) >= 0, cmp(toP3, largest) <= 0]).toEqual([true, true])
    expect(cmp(toP3, GEM_PRICE_STEP_P2_TO_P3)).toBeLessThan(0)
  })
})
