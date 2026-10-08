import { describe, expect, it } from 'vitest'
import {
  describeRuns,
  incomeRatioBp,
  magneticPlanetRunsOn,
  MAGNETIC_PLANETS,
  MAGNETIC_SEEDS,
  MAX_BARE_TIME_BP,
  MAX_INCOME_BP,
  median,
  MIN_BARE_TIME_BP,
  MIN_BIT_TIME_BP,
  timeRatioBp,
  type MagneticPlanetRuns,
} from './magneticPlanetRuns'

// `balance:magnetic-planet` (GD lock on spec #258 Q7, ticket 294): the pacing bot arrives on
// planets 25, 28 and 32 on-curve and plays to the core on each pacing seed three ways, all else
// equal: the class off at the same index, the class on with a bare head, and the class on with the
// dielectric bit. Judged on the median of the per-seed ratios to the class-off run (#84):
// - without the bit, at most +10% planet time and never faster than off: a twist, not a shortcut;
// - with the bit, at least 0.98x the class-off time: pure negation never beats baseline;
// - income per minute on the magnetic run at most +15% (the magnets' cap, measured here and not
//   raised).
// The P25 pace targets are unchanged; the slice's 100-110 min pin and the P1 core's 58 min are
// `logging/pacingGate.test.ts`'s, which no magnetic planet reaches. If a planet runs slow, the first
// lever is `magnetic.electrifiedShareBp` in planet-mix.economy.json, never the shock time.
// Long: 27 bot runs, for the box Tester (`npm run balance:magnetic-planet`).

const TIMEOUT_MS = 2 * 60 * 60 * 1000

const SLOW_PLANET_LEVER =
  'runs slow: lower magnetic.electrifiedShareBp in planet-mix.economy.json first, not the shock time'

const runsByPlanet = new Map<number, MagneticPlanetRuns[]>()

/** The three runs on every pacing seed, played once per planet for all the asserts. */
function runsOn(planet: number): MagneticPlanetRuns[] {
  const cached = runsByPlanet.get(planet)
  if (cached !== undefined) return cached
  const runs = MAGNETIC_SEEDS.map((seed) => playAndLog(planet, seed))
  runsByPlanet.set(planet, runs)
  return runs
}

function playAndLog(planet: number, seed: number): MagneticPlanetRuns {
  const runs = magneticPlanetRunsOn(planet, seed)
  console.log(describeRuns(runs))
  return runs
}

describe('magnetic planet pace (balance:magnetic-planet, GD lock on #258)', () => {
  it.each(MAGNETIC_PLANETS)(
    'takes planet %i at most 10% longer without the bit than with the class off, never faster',
    (planet) => {
      const ratio = median(runsOn(planet).map(({ bare, off }) => timeRatioBp(bare, off)))
      expect(ratio, `P${planet} ${SLOW_PLANET_LEVER}`).toBeLessThanOrEqual(MAX_BARE_TIME_BP)
      expect(ratio, `P${planet} is a shortcut with the class on`).toBeGreaterThanOrEqual(
        MIN_BARE_TIME_BP,
      )
    },
    TIMEOUT_MS,
  )

  it.each(MAGNETIC_PLANETS)(
    'takes planet %i with the dielectric bit at least 0.98x the class-off time',
    (planet) => {
      const ratio = median(runsOn(planet).map(({ withBit, off }) => timeRatioBp(withBit, off)))
      expect(ratio).toBeGreaterThanOrEqual(MIN_BIT_TIME_BP)
    },
    TIMEOUT_MS,
  )

  it.each(MAGNETIC_PLANETS)(
    'earns at most 15% more per minute on magnetic planet %i than with the class off',
    (planet) => {
      const ratio = median(runsOn(planet).map(({ bare, off }) => incomeRatioBp(bare, off)))
      expect(ratio).toBeLessThanOrEqual(MAX_INCOME_BP)
    },
    TIMEOUT_MS,
  )
})
