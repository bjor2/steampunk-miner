import { describe, expect, it } from 'vitest'
import { bandEvery } from './render/rigLookFixtures'
import type { TrackLookRows } from './render/rigLookIndex'
import {
  cadenceWarningOf,
  edgesFirstReachedOf,
  planetsPerBandOf,
  purchasesPerPlanetOf,
  type TrackPurchase,
} from './rigLookPlanets'

/** Bands of 5 engine purchases, four edges. */
const ENGINE: TrackLookRows = {
  track: 'engine',
  slot: 'chassis.drive',
  glowSlots: [['piston']],
  glowCap: 'rigBody',
  steps: [{ from: 5, part: null, card: null, colour: '#d9a066', glows: [0.3] }],
  band: bandEvery(5, 4),
}

/** One engine purchase per level from `from + 1` to `to` on `planet`. */
function buys(planet: number, from: number, to: number): TrackPurchase[] {
  return Array.from({ length: to - from }, (_, at) => ({
    track: 'engine',
    planet,
    toLevel: from + at + 1,
  }))
}

describe('rig look band cadence (ticket 809)', () => {
  it('finds the planet each edge was first reached on, null for one never reached', () => {
    const run = [...buys(1, 0, 6), ...buys(3, 6, 12), { track: 'hull', planet: 4, toLevel: 99 }]
    expect(edgesFirstReachedOf(ENGINE, run)).toEqual([
      { edge: 5, planet: 1 },
      { edge: 10, planet: 3 },
      { edge: 15, planet: null },
      { edge: 20, planet: null },
    ])
  })

  it("counts a line's purchases on every planet, 0 where it bought none", () => {
    const run = [...buys(1, 0, 3), ...buys(3, 3, 4)]
    expect(purchasesPerPlanetOf('engine', run, 4)).toEqual([3, 0, 1, 0])
    expect(purchasesPerPlanetOf('fuel_tank', run, 2)).toEqual([0, 0])
  })

  it('reads the planets finished per band reached as the cadence', () => {
    const run = [...buys(1, 0, 5), ...buys(3, 5, 10), ...buys(5, 10, 15)]
    expect(planetsPerBandOf(ENGINE, run, 6)).toBe(2)
    expect(planetsPerBandOf(ENGINE, [], 6)).toBe(Infinity)
  })

  it('warns, never fails, when a line falls outside 1 to 3 planets a band', () => {
    const steady = [...buys(1, 0, 5), ...buys(3, 5, 10), ...buys(5, 10, 15)]
    expect(cadenceWarningOf(ENGINE, steady, 6)).toBeNull()
    expect(cadenceWarningOf(ENGINE, buys(1, 0, 20), 2)).toBe('engine: 0.50 planets a band by P2')
    expect(cadenceWarningOf(ENGINE, buys(1, 0, 5), 8)).toBe('engine: 8.00 planets a band by P8')
    expect(cadenceWarningOf(ENGINE, [], 8)).toBe('engine: no band reached by P8')
  })
})
