import { describe, expect, it } from 'vitest'
import {
  baseUsesOf,
  bestTwistedRunOf,
  describeRuns,
  incomeRatioBp,
  MAX_INCOME_BP,
  median,
  MIN_TIME_BP,
  TWIST_PACE_PLANETS,
  TWIST_PACE_SEEDS,
  timeRatioBp,
  twistPaceRunsOn,
  type TwistPaceRuns,
} from './twistPaceRuns'
import { TWISTS } from './systems/twistCatalogue'

// Pin 6 of the GD lock on #206 for the twists (the Vertical Scaler's conditions, a failing gate;
// ticket 329): the pacing bot arrives on planets 7 and 10 on-curve and plays to the core on each
// pacing seed bare, with every twist's base item owned and pressed by the twist hand, and once per
// twist with that twist held too. Judged on the median of the per-seed ratios (#84): the bot's
// best card reaches the core no faster than 0.98x the time without a twist, and every twist with
// its base item earns at most +15% per minute over the bare run (#162 4.5), so each sits inside
// its base item's cap. Long: fifteen bot runs a planet, for the box Tester.

const TIMEOUT_MS = 60 * 60 * 1000

const runsByPlanet = new Map<number, TwistPaceRuns[]>()

/** Every run on every pacing seed, played once per planet for all the asserts. */
function runsOn(planet: number): TwistPaceRuns[] {
  const cached = runsByPlanet.get(planet)
  if (cached !== undefined) return cached
  const runs = TWIST_PACE_SEEDS.map((seed) => playAndLog(planet, seed))
  runsByPlanet.set(planet, runs)
  return runs
}

function playAndLog(planet: number, seed: number): TwistPaceRuns {
  const runs = twistPaceRunsOn(planet, seed)
  console.log(describeRuns(runs))
  return runs
}

describe('artefact twists pace (pin 6, GD lock on #206)', () => {
  it.each(TWIST_PACE_PLANETS)(
    'presses the base items on planet %i on every seed',
    (planet) => {
      for (const runs of runsOn(planet)) {
        const isPressed = baseUsesOf(bestTwistedRunOf(runs).run) > 0
        expect({ seed: runs.seed, isPressed }).toEqual({ seed: runs.seed, isPressed: true })
      }
    },
    TIMEOUT_MS,
  )

  it.each(TWIST_PACE_PLANETS)(
    'reaches planet %i core with the best twist no faster than 0.98x the time without one',
    (planet) => {
      const ratio = median(
        runsOn(planet).map((runs) => timeRatioBp(bestTwistedRunOf(runs).run, runs.base)),
      )
      expect(ratio, `P${planet} best twist runs fast`).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )

  it.each(TWIST_PACE_PLANETS)(
    'earns at most 15% more per minute on planet %i with each twist and its base item',
    (planet) => {
      for (const { optionId } of TWISTS) {
        const ratio = median(
          runsOn(planet).map((runs) => {
            const twisted = runs.twisted.find((entry) => entry.optionId === optionId)!
            return incomeRatioBp(twisted.run, runs.bare)
          }),
        )
        expect(ratio, `P${planet} ${optionId} over the income cap`).toBeLessThanOrEqual(
          MAX_INCOME_BP,
        )
      }
    },
    TIMEOUT_MS,
  )
})
