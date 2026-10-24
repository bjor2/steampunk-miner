import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { ECONOMY } from '../economy/economy'
import { coreFragmentsNeeded } from '../economy/planetEconomy'
import { planetsBefore } from '../starMap/campaignIndex'
import { coreTileCount } from '../world/planetGeometry'
import { coreNeededOf } from './coreBay'
import { enteredPlanetOf, planetParamsOf, withSystem, type SessionPlanet } from './planetOfState'

// Ticket 801 (the VS conditions on #790): a planet's core need comes from its size row alone,
// `ceil(0.4 * coreTileCount)` (#10), with no g term. Goldens at g = 1, 2, 5, 6 (system 2's
// planet 1), 10 and 1e6, on every pacing seed.
const GOLDENS: readonly { g: number; needed: number }[] = [
  { g: 1, needed: 63 },
  { g: 2, needed: 127 },
  { g: 5, needed: 127 },
  { g: 6, needed: 127 },
  { g: 10, needed: 127 },
  { g: 1_000_000, needed: 127 },
]
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('core needed', () => {
  it.each(GOLDENS)('needs $needed fragments at g = $g on every pacing seed', ({ g, needed }) => {
    for (const seed of SEEDS) expect(coreNeededOf(planetAtCampaignIndex(g, seed))).toBe(needed)
  })

  it.each(GOLDENS)(
    'is ceil(0.4 * coreTileCount) of the size row at g = $g, nothing more',
    ({ g }) => {
      for (const seed of SEEDS) {
        const planet = planetAtCampaignIndex(g, seed)
        const tiles = coreTileCount(paramsOf(planet))
        expect(coreNeededOf(planet)).toBe(Math.ceil(0.4 * tiles))
        expect(coreNeededOf(planet)).toBe(coreFragmentsNeeded(tiles))
      }
    },
  )

  it('puts g = 6 on system 2 planet 1 and g = 1e6 past system 1, as the goldens claim', () => {
    expect(planetAtCampaignIndex(6, SEEDS[0]).system).toBe('2')
    expect(planetAtCampaignIndex(1_000_000, SEEDS[0]).system).toBe('200000')
    expect(planetAtCampaignIndex(5, SEEDS[0]).system).toBeUndefined()
  })
})

/** The session planet at campaign index `g`: its system holds g, its `index` is g (#781). */
function planetAtCampaignIndex(g: number, seed: number): SessionPlanet {
  return withSystem(enteredPlanetOf(g, seed), systemHolding(g))
}

function systemHolding(g: number): bigint {
  const system = BigInt(Math.floor((g - 1) / ECONOMY.starMap.planetsPerSystem) + 1)
  if (BigInt(g) <= planetsBefore(system)) throw new RangeError(`g ${g} is before system ${system}`)
  return system
}

function paramsOf(planet: SessionPlanet) {
  const params = planetParamsOf(planet)
  if (params === null) throw new Error(`planet ${planet.index} has no generated world`)
  return params
}
