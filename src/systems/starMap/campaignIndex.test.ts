import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { oreTier, oreValue } from '../economy/oreEconomy'
import { div, fromCanonical, toCanonical } from '../money'
import { gemSaleTiersOfPlanet } from '../registries/planetRow'
import { BAND_COUNT } from '../world/planetGeometry'
import { campaignIndex, planetIndexAt, planetIndexOfCampaign, planetsBefore } from './campaignIndex'

const PLANETS_PER_SYSTEM = BigInt(ECONOMY.starMap.planetsPerSystem)

describe('star map campaign index', () => {
  it('is the planet index itself in system 1, so P1 onward keep their economy (#650 TD)', () => {
    const planets = [1n, 2n, 3n, 4n, 5n, 40n, 1000n, 2n ** 70n]
    expect(planets.map((planet) => campaignIndex(1n, planet))).toEqual(planets)
  })

  it('follows the last planet of the system before with no gap (TD ruling, ticket 781)', () => {
    const systems = [2n, 10n, 10n ** 6n]
    const firsts = systems.map((system) => campaignIndex(system, 1n))
    const lastsBefore = systems.map((system) => campaignIndex(system - 1n, PLANETS_PER_SYSTEM))
    expect(firsts).toEqual(lastsBefore.map((last) => last + 1n))
  })

  it('numbers planet 1 of system 2 as campaign planet 6', () => {
    expect(campaignIndex(2n, 1n)).toBe(6n)
  })

  it('counts the planets of every earlier system before a system', () => {
    expect([1n, 2n, 10n].map(planetsBefore)).toEqual([0n, 5n, 45n])
  })

  it('rises with the planet inside every system', () => {
    expect(campaignIndex(3n, 5n) - campaignIndex(3n, 4n)).toBe(1n)
  })

  it('holds a system past the safe-integer range exactly', () => {
    const system = 10n ** 30n
    expect(campaignIndex(system, 1n)).toBe(1n + (system - 1n) * PLANETS_PER_SYSTEM)
  })

  it('refuses a system or a planet below 1', () => {
    expect(() => campaignIndex(0n, 1n)).toThrow(RangeError)
    expect(() => campaignIndex(1n, 0n)).toThrow(RangeError)
  })

  it('narrows to the safe-integer planet index and refuses one it would round', () => {
    expect(planetIndexOfCampaign(campaignIndex(1n, 5n))).toBe(5)
    expect(() => planetIndexOfCampaign(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError)
    expect(() => planetIndexOfCampaign(0n)).toThrow(RangeError)
  })
})

describe('star map system jump value step', () => {
  const lastOfSystem1 = planetIndexAt(1n, PLANETS_PER_SYSTEM) ?? 0
  const firstOfSystem2 = planetIndexAt(2n, 1n) ?? 0
  const topBandTierOf = (planetIndex: number) => oreTier(planetIndex, BAND_COUNT)

  it("lifts band 5's ore tier by 3 from system 1's last planet to system 2's first (Systems)", () => {
    expect(topBandTierOf(firstOfSystem2) - topBandTierOf(lastOfSystem1)).toBe(3)
  })

  it('makes that a x3.375 step in V(t), the same as any p to p + 1', () => {
    const systemStep = div(
      oreValue(topBandTierOf(firstOfSystem2)),
      oreValue(topBandTierOf(lastOfSystem1)),
    )
    const planetStep = div(oreValue(topBandTierOf(3)), oreValue(topBandTierOf(2)))
    const valueStep = toCanonical(fromCanonical('3.375'))
    expect([toCanonical(systemStep), toCanonical(planetStep)]).toEqual([valueStep, valueStep])
  })

  it("lifts t_top and every gem tier by 3 over system 1's last planet", () => {
    const lastTiers = gemSaleTiersOfPlanet(lastOfSystem1)
    expect(lastTiers.length).toBeGreaterThan(0)
    expect(gemSaleTiersOfPlanet(firstOfSystem2)).toEqual(lastTiers.map((tier) => tier + 3))
  })
})
