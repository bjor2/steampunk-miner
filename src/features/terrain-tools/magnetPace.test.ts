import { describe, expect, it } from 'vitest'
import {
  describeRuns,
  incomeRatioBp,
  MAGNET_PACE_PLANETS,
  MAGNET_PACE_SEEDS,
  magnetPaceRunsOn,
  magnetUsesOf,
  MAX_INCOME_BP,
  median,
  MIN_TIME_BP,
  timeRatioBp,
  type MagnetPaceRuns,
} from './magnetPaceRuns'

// `balance:magnets` (GD lock on #246, build 6; ticket 287): the pacing bot arrives on planets 7
// and 10 on-curve and plays to the core on each pacing seed twice, once with an empty loadout and
// once with the repulsor coil and the lode clamp granted through the debug loadout, the magnet hand
// pressing both at every chance. Judged on the median of the per-seed ratios to the bare run (#84):
// - time to core with the family at least 0.98x the bare time;
// - income per minute with the family at most +15% (the family's income cap).
// If the family runs fast, the first lever is the magnets' energy draw, never ore price.
// Long: a dozen bot runs, for the box Tester (`npm run balance:magnets`).

const TIMEOUT_MS = 60 * 60 * 1000

const FAST_LEVER =
  'runs fast: raise the magnets energy draw (magnets.cellEnergyFloorBp) first, never ore price'

const runsByPlanet = new Map<number, MagnetPaceRuns[]>()

/** Both runs on every pacing seed, played once per planet for all the asserts. */
function runsOn(planet: number): MagnetPaceRuns[] {
  const cached = runsByPlanet.get(planet)
  if (cached !== undefined) return cached
  const runs = MAGNET_PACE_SEEDS.map((seed) => playAndLog(planet, seed))
  runsByPlanet.set(planet, runs)
  return runs
}

function playAndLog(planet: number, seed: number): MagnetPaceRuns {
  const runs = magnetPaceRunsOn(planet, seed)
  console.log(describeRuns(runs))
  return runs
}

describe('terrain magnets pace (balance:magnets, GD lock on #246)', () => {
  it.each(MAGNET_PACE_PLANETS)(
    'uses both the coil and the clamp on planet %i on every seed',
    (planet) => {
      for (const { seed, withMagnets } of runsOn(planet)) {
        const uses = {
          seed,
          repel: magnetUsesOf(withMagnets, 'repel') > 0,
          anchor: magnetUsesOf(withMagnets, 'anchor') > 0,
        }
        expect(uses).toEqual({ seed, repel: true, anchor: true })
      }
    },
    TIMEOUT_MS,
  )

  it.each(MAGNET_PACE_PLANETS)(
    'reaches planet %i core no faster than 0.98x the bare time with the family',
    (planet) => {
      const ratio = median(
        runsOn(planet).map(({ bare, withMagnets }) => timeRatioBp(withMagnets, bare)),
      )
      expect(ratio, `P${planet} ${FAST_LEVER}`).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )

  it.each(MAGNET_PACE_PLANETS)(
    'earns at most 15% more per minute on planet %i with the family',
    (planet) => {
      const ratio = median(
        runsOn(planet).map(({ bare, withMagnets }) => incomeRatioBp(withMagnets, bare)),
      )
      expect(ratio, `P${planet} ${FAST_LEVER}`).toBeLessThanOrEqual(MAX_INCOME_BP)
    },
    TIMEOUT_MS,
  )
})
