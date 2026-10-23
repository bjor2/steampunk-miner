import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor, planetSeedFor } from '../world/planetParams'
import { campaignIndex } from './campaignIndex'
import { planetSeedAt } from './planetAddressSeed'

const WORLD_SEED = 83921

/**
 * Ticket 754's goldens (the VS bars on #650: s = 1, 2, 10, 1e6 and p = 1, 2, 5, 10, 40, 1000):
 * `[s, p, g, planet seed]` under world seed 83921 and today's provisional system advance. A row
 * changes only with the address law or `starMap.systemAdvance`, and system 1's never.
 */
const ADDRESS_GOLDENS: readonly (readonly [bigint, bigint, bigint, number])[] = [
  [1n, 1n, 1n, 3997541145],
  [1n, 2n, 2n, 3417439050],
  [1n, 5n, 5n, 2707927653],
  [1n, 10n, 10n, 3604396040],
  [1n, 40n, 40n, 54922117],
  [1n, 1000n, 1000n, 166274059],
  [2n, 1n, 11n, 4289805408],
  [2n, 2n, 12n, 21352925],
  [2n, 5n, 15n, 827604736],
  [2n, 10n, 20n, 3381520899],
  [2n, 40n, 50n, 2934193739],
  [2n, 1000n, 1010n, 3177984871],
  [10n, 1n, 91n, 2992252446],
  [10n, 2n, 92n, 934048516],
  [10n, 5n, 95n, 1971536815],
  [10n, 10n, 100n, 1964902730],
  [10n, 40n, 130n, 647502709],
  [10n, 1000n, 1090n, 72193512],
  [1000000n, 1n, 9999991n, 579943453],
  [1000000n, 2n, 9999992n, 2969238610],
  [1000000n, 5n, 9999995n, 269685393],
  [1000000n, 10n, 10000000n, 2562376693],
  [1000000n, 40n, 10000030n, 3518064234],
  [1000000n, 1000n, 10000990n, 2975366194],
]

describe('star map planet seeds', () => {
  it("keeps today's planet seed in system 1, so P1 to P5 generate byte-identical worlds", () => {
    const planets = [1, 2, 3, 4, 5]
    const fromAddress = planets.map((planet) => planetSeedAt(WORLD_SEED, 1n, BigInt(planet)))
    const generated = planets.map((planet) => freshPlanetParamsFor(WORLD_SEED, planet).planetSeed)
    expect(fromAddress).toEqual(generated)
  })

  it("keeps today's seed for a system 1 planet past 32 bits too", () => {
    const planet = 2 ** 40 + 3
    expect(planetSeedAt(WORLD_SEED, 1n, BigInt(planet))).toBe(planetSeedFor(WORLD_SEED, planet))
  })

  it('hashes the address, not the campaign index two addresses share', () => {
    expect(campaignIndex(2n, 1n)).toBe(campaignIndex(1n, campaignIndex(2n, 1n)))
    expect(planetSeedAt(WORLD_SEED, 2n, 1n)).not.toBe(
      planetSeedAt(WORLD_SEED, 1n, campaignIndex(2n, 1n)),
    )
  })

  it('gives planets past 64 bits seeds of their own', () => {
    const planet = 2n ** 64n + 5n
    expect(planetSeedAt(WORLD_SEED, 1n, planet)).not.toBe(planetSeedAt(WORLD_SEED, 1n, 5n))
    expect(planetSeedAt(WORLD_SEED, 2n ** 64n + 2n, 1n)).not.toBe(planetSeedAt(WORLD_SEED, 2n, 1n))
  })

  it('matches the address goldens at s = 1, 2, 10 and 1e6', () => {
    const computed = ADDRESS_GOLDENS.map(([system, planet]) => [
      system,
      planet,
      campaignIndex(system, planet),
      planetSeedAt(WORLD_SEED, system, planet),
    ])
    expect(computed).toEqual(ADDRESS_GOLDENS)
  })

  it('is a uint32 for every golden address, the same on every call', () => {
    const seeds = ADDRESS_GOLDENS.map(([system, planet]) =>
      planetSeedAt(WORLD_SEED, system, planet),
    )
    expect(seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32)).toBe(true)
    expect(ADDRESS_GOLDENS.map(([s, p]) => planetSeedAt(WORLD_SEED, s, p))).toEqual(seeds)
  })
})
