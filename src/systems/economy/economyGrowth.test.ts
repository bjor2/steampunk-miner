import { describe, expect, it } from 'vitest'
import { add, cmp, div, fromCanonical, isMoney, mul, sub, type Money } from '../money'
import { BAND_START_DEPTH_PERCENT } from '../world/planetTable'
import { ECONOMY } from './economy'
import { enemyStatsRow, onCurveVehicleRow, planetEconomyRow, planetPriceRow } from './economyTables'
import { drillPower, engineStats, rescueEnergyFloor } from './vehicleStats'

const m = fromCanonical
const PLANETS = [...Array.from({ length: 40 }, (_, index) => index + 1), 1000, 1_000_000]

/** Money keeps 40 digits (#5), so a ratio of two rounded values may differ in the last ones. */
function agreesTo35Digits(actual: Money, expected: Money): boolean {
  const tolerance = mul(expected, m('1e-35'))
  return cmp(sub(actual, expected), tolerance) <= 0 && cmp(sub(expected, actual), tolerance) <= 0
}

/** Every Money/BigStat a planet's rows hold that must grow with the planet, by name. */
function growingAmountsOf(planetIndex: number): Map<string, Money> {
  const enemy = enemyStatsRow('crawler', planetIndex)
  const columns = {
    ...planetEconomyRow(planetIndex),
    ...onCurveVehicleRow(planetIndex).stats,
    ...planetPriceRow(planetIndex),
    healthByBand: enemy.healthByBand,
    baseHitByBand: enemy.baseHitByBand,
  }
  return new Map(Object.entries(columns).flatMap(([name, value]) => amountsNamed(name, value)))
}

function amountsNamed(name: string, value: unknown): [string, Money][] {
  if (isMoney(value)) return [[name, value]]
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index) => amountsNamed(`${name}[${index}]`, entry))
}

describe('economy growth past the slice', () => {
  it('keeps the radius non-decreasing and at most 1000, and the core at most 316 tiles', () => {
    const rows = PLANETS.map(planetEconomyRow)
    const radii = rows.map((row) => row.radiusTiles)
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
    expect(Math.max(...radii)).toBeLessThanOrEqual(1000)
    expect(Math.max(...rows.map((row) => row.coreTileCount))).toBeLessThanOrEqual(316)
    expect(rows.every((row) => row.coreFragmentsNeeded <= row.coreTileCount)).toBe(true)
  })

  it('makes every money and big-stat value finite and strictly increasing in the planet', () => {
    const planets = PLANETS.map(growingAmountsOf)
    expect(planets[0].size).toBeGreaterThan(20)
    planets.slice(1).forEach((amounts, index) => {
      for (const [name, amount] of amounts) {
        const before = planets[index].get(name)
        expect({
          name,
          planet: PLANETS[index + 1],
          rises: before && cmp(before, amount) < 0,
        }).toEqual({ name, planet: PLANETS[index + 1], rises: true })
      }
    })
  })

  it("grows on-curve drill power and hull by 1.12^6 per planet, to Money's 40 digits", () => {
    for (const planet of PLANETS.slice(0, 40)) {
      const here = onCurveVehicleRow(planet).stats
      const next = onCurveVehicleRow(planet + 1).stats
      expect(agreesTo35Digits(div(next.drillPower, here.drillPower), m('1.973822685184'))).toBe(
        true,
      )
      expect(agreesTo35Digits(div(next.hullMax, here.hullMax), m('1.973822685184'))).toBe(true)
    }
  })
})

describe('rescue energy (#9, #20 acceptance 6)', () => {
  it('leaves 37.5 units at level 0, more than a planet 1 round trip to the first ore', () => {
    const depthTiles = m(String((300 * BAND_START_DEPTH_PERCENT[0]) / 100))
    const { drill, thrust } = ECONOMY.energy.perSecond
    const digEnergy = mul(div(depthTiles, drillPower(0)), drill)
    const climbEnergy = mul(div(depthTiles, m(String(engineStats(0).speedMax))), thrust)
    const roundTrip = add(digEnergy, climbEnergy)
    expect(rescueEnergyFloor(0)).toEqual(m('37.5'))
    expect(roundTrip).toEqual(m('22'))
    expect(cmp(roundTrip, rescueEnergyFloor(0))).toBe(-1)
  })
})
