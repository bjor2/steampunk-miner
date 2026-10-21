import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../../systems/world/planetParams'
import { EMPTY_WORLD } from '../../../systems/world/worldState'
import { pocketKindsNearDock } from './hazardNearDock'

// The hazard a player meets on landing (ticket 656): the pocket kinds round the dock point on the
// world seed a fresh browser save plays (`STARTING_PLANET` in gameStore.ts), which the per-planet
// fresh-save browser specs read through `features.ores.getPlanetRow()`.

const FRESH_SAVE_SEED = 1

describe('hazard near the dock', () => {
  it("finds each of planets 2 to 5's own pocket kind round the dock on a fresh save's seed", () => {
    const kinds = [2, 3, 4, 5].map((planet) =>
      pocketKindsNearDock(freshPlanetParamsFor(FRESH_SAVE_SEED, planet), EMPTY_WORLD),
    )
    expect(kinds).toEqual([['rockfall'], ['firedamp'], ['spinecrystal'], ['steamvent']])
  })

  it('finds none on planet 1 or past planet 5', () => {
    for (const planet of [1, 6]) {
      expect(
        pocketKindsNearDock(freshPlanetParamsFor(FRESH_SAVE_SEED, planet), EMPTY_WORLD),
      ).toEqual([])
    }
  })
})
