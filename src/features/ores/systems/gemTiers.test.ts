import { describe, expect, it } from 'vitest'
import { formatPrice } from '../../../systems/displayAmount'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { cmp, fromCanonical, mul, toCanonical, type Money } from '../../../systems/money'
import { gemSaleTiersOfPlanet } from '../../../systems/registries/planetRow'
import { oreRulesVersionOnEntry } from '../../../systems/world/planetParams'
import { topOreTierOf } from './gemTiers'
import { ORE_ROWS } from './oreRows'

// The gem tier's prices (ticket 741, Systems' final spec on #741 under the integer tiers of
// Systems' decision on #713, Bjor's OK of 23 Oct): planetRow(p) answers t_g(p, k) = t_top(p) + Δ_k,
// Δ = 5, 6 and 8 fixed from P1, and G = V(t_g) on Money with no bound on p. The guard
// G(p) >= 1.5 G(p - 1) holds for each rank, and each planet's cheapest gem sells above every other
// ore of its planet and never below the previous planet's dearest gem. Checked against Python's
// Decimal to the 40 significant digits Money keeps past 1e37 (#340).

const GOLDEN_PLANETS = [1, 2, 5, 10, 40, 1000]
const GUARD_PLANETS = Array.from({ length: 199 }, (_, at) => at + 2)
const FAR_PLANETS = [1000, 1_000_000]
const GUARD_RATIO = fromCanonical('1.5')

/** Each gem's price on planet p, cheapest first. */
function gemPricesOf(planetIndex: number): Money[] {
  return gemSaleTiersOfPlanet(planetIndex).map(oreSalePrice)
}

/** The dearest tier any other ore of a fresh planet sells at: band 5's top lead, a signature's +1. */
function topNonGemSaleTierOf(planetIndex: number): number {
  return (
    topOreTierOf(planetIndex, oreRulesVersionOnEntry(planetIndex)) + ORE_ROWS.signatureValueLead
  )
}

describe('gem tier prices', () => {
  it('sells the three gems Δ 5, 6 and 8 above the top ore tier of P1, P2, P5, P10, P40 and P1000', () => {
    expect(GOLDEN_PLANETS.map(gemSaleTiersOfPlanet)).toEqual([
      [12, 13, 15],
      [15, 16, 18],
      [26, 27, 29],
      [41, 42, 44],
      [131, 132, 134],
      [3011, 3012, 3014],
    ])
    expect(
      GOLDEN_PLANETS.map((planet) => topOreTierOf(planet, oreRulesVersionOnEntry(planet))),
    ).toEqual([7, 10, 21, 36, 126, 3006])
  })

  it('prices them on Money with no overflow, P1 at the 865, 1297 and 2919 Bjor accepted', () => {
    expect(GOLDEN_PLANETS.map((planet) => gemPricesOf(planet).map(toCanonical))).toEqual([
      ['8.64975e+2', '1.297463e+3', '2.919292e+3'],
      ['2.919292e+3', '4.378938e+3', '9.852612e+3'],
      ['2.52511682e+5', '3.78767524e+5', '8.52226929e+5'],
      ['1.10573323209e+8', '1.65859984814e+8', '3.73184965831e+8'],
      [
        '7.79585364353461600690197569e+23',
        '1.169378046530192401035296354e+24',
        '2.631100604692932902329416796e+24',
      ],
      [
        '1.083152877009892284630467767662202410998e+531',
        '1.624729315514838426945701651493303616497e+531',
        '3.655640959908386460627828715859933137118e+531',
      ],
    ])
  })

  it('shows them through the shared price formatter, rounded up', () => {
    expect(GOLDEN_PLANETS.map((planet) => gemPricesOf(planet).map(formatPrice))).toEqual([
      ['865', '1,298', '2,920'],
      ['2,920', '4,379', '9,853'],
      ['253k', '379k', '853k'],
      ['111M', '166M', '374M'],
      ['780Sx', '1.17Sp', '2.64Sp'],
      ['2e531', '2e531', '4e531'],
    ])
  })

  it('holds the guard G(p) >= 1.5 G(p - 1) for every gem rank from P2 to P200 and far past', () => {
    const planets = [...GUARD_PLANETS, ...FAR_PLANETS]
    const broken = planets.filter((planet) => {
      const before = gemPricesOf(planet - 1)
      return gemPricesOf(planet).some(
        (price, rank) => cmp(price, mul(before[rank], GUARD_RATIO)) < 0,
      )
    })
    expect(broken).toEqual([])
  })

  it("sells each planet's cheapest gem above every other ore of its planet", () => {
    const planets = [1, ...GUARD_PLANETS, ...FAR_PLANETS]
    const broken = planets.filter(
      (planet) => gemSaleTiersOfPlanet(planet)[0] <= topNonGemSaleTierOf(planet),
    )
    expect(broken).toEqual([])
  })

  it("never sells a planet's cheapest gem below the previous planet's dearest", () => {
    const planets = [...GUARD_PLANETS, ...FAR_PLANETS]
    const broken = planets.filter(
      (planet) => gemSaleTiersOfPlanet(planet)[0] < gemSaleTiersOfPlanet(planet - 1)[2],
    )
    expect(broken).toEqual([])
    expect(gemSaleTiersOfPlanet(3)[0]).toBeGreaterThan(gemSaleTiersOfPlanet(2)[2])
  })
})
