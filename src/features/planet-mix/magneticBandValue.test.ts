import { describe, expect, it } from 'vitest'
import { planetParamsFor } from '../../systems/world/planetParams'
import { bandOreValuesOf } from './magneticBandValue'
import { withMagneticClassOff } from './magneticClassOff'
import {
  BAND_VALUE_TOLERANCE_BP,
  BASIS_POINTS,
  MAGNETIC_PLANETS,
  MAGNETIC_SEEDS,
  ratioBp,
} from './magneticPlanetRuns'
import { isMagneticPlanet } from './systems/planetClass'

// `balance:magnetic-planet`, value neutrality (GD lock on spec #258 Q7, ticket 294): a magnetic
// planet adds no value or price premium. Its ferrous and induction cells sell through the existing
// tiers and `saleTier`, so every band's generated ore value stays within #141's +4% of the same
// planet index with the class off, on each pacing seed.

/** A whole planet generated twice per seed, three seeds: about half a minute a planet. */
const TIMEOUT_MS = 10 * 60 * 1000

describe('magnetic planet band value (balance:magnetic-planet)', () => {
  it.each(MAGNETIC_PLANETS)(
    "keeps each band of planet %i within 4% of the class-off planet's value on every seed",
    (planet) => {
      expect(isMagneticPlanet(planet)).toBe(true)
      for (const seed of MAGNETIC_SEEDS) {
        const params = planetParamsFor(seed, planet)
        const on = bandOreValuesOf(params)
        const off = withMagneticClassOff(() => bandOreValuesOf(params))
        const drifts = on.map((value, at) => Math.abs(ratioBp(value, off[at]) - BASIS_POINTS))
        expect(Math.max(...drifts), `seed ${seed}`).toBeLessThanOrEqual(BAND_VALUE_TOLERANCE_BP)
      }
    },
    TIMEOUT_MS,
  )
})
