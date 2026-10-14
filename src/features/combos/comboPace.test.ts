import { describe, expect, it } from 'vitest'
import { stateDigest } from '../../systems/authority/stateDigest'
import {
  autoShieldRunOn,
  COMBO_PACE_PLANETS,
  COMBO_PACE_SEEDS,
  comboPaceRunsOn,
  coreTicksOf,
  describeRuns,
  incomeRatioBp,
  isShieldAutoSwitchable,
  MAX_INCOME_BP,
  median,
  MIN_TIME_BP,
  partnerUsesOf,
  shieldPaceRunsOn,
  timeRatioBp,
  type ComboPaceRuns,
} from './comboPaceRuns'

// Pin 6 of the GD lock on #206 (the Vertical Scaler's conditions, a failing gate): the pacing bot
// arrives on planets 7 and 10 on-curve and plays to the core on each pacing seed bare, with every
// shipped combo's parents owned and the drain, shifter and corer pressed by the combo hand, and
// with every shipped combo owned too ("all on"). Judged on the median of the per-seed ratios
// (#84): time to core all on at least 0.98x without the combos, and the income per minute of the
// combos and their parents together at most +15% over the bare run (#162 4.5), which holds every
// item, the magnetic survey under the sounder's, inside the cap. The alarm shield's own runs
// reach the core no slower than 0.98x the shield pressed by hand on every lunge warning, and the
// auto run replays to the same digest, as a guest replaying the host's commands does; they wait
// for the steam sear's node (#318), the one switch that puts the shield on auto (ticket 328).
// Long: two dozen bot runs, for the box Tester.

const TIMEOUT_MS = 60 * 60 * 1000

const runsByPlanet = new Map<number, ComboPaceRuns[]>()

/** The three runs on every pacing seed, played once per planet for all the asserts. */
function runsOn(planet: number): ComboPaceRuns[] {
  const cached = runsByPlanet.get(planet)
  if (cached !== undefined) return cached
  const runs = COMBO_PACE_SEEDS.map((seed) => playAndLog(planet, seed))
  runsByPlanet.set(planet, runs)
  return runs
}

function playAndLog(planet: number, seed: number): ComboPaceRuns {
  const runs = comboPaceRunsOn(planet, seed)
  console.log(describeRuns(runs))
  return runs
}

describe('combos pace (pin 6, GD lock on #206)', () => {
  it.each(COMBO_PACE_PLANETS)(
    'presses the partner items on planet %i on every seed',
    (planet) => {
      for (const { seed, combos } of runsOn(planet)) {
        expect({ seed, isPressed: partnerUsesOf(combos) > 0 }).toEqual({ seed, isPressed: true })
      }
    },
    TIMEOUT_MS,
  )

  it.each(COMBO_PACE_PLANETS)(
    'reaches planet %i core no faster than 0.98x the time without the combos',
    (planet) => {
      const ratio = median(
        runsOn(planet).map(({ parents, combos }) => timeRatioBp(combos, parents)),
      )
      expect(ratio, `P${planet} combos run fast`).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )

  it.each(COMBO_PACE_PLANETS)(
    'earns at most 15% more per minute on planet %i with the combos and their parents',
    (planet) => {
      const ratio = median(runsOn(planet).map(({ bare, combos }) => incomeRatioBp(combos, bare)))
      expect(ratio, `P${planet} combos and parents over the income cap`).toBeLessThanOrEqual(
        MAX_INCOME_BP,
      )
    },
    TIMEOUT_MS,
  )
})

describe('alarm shield pace (GD lock on #206, decision 6)', () => {
  it.skipIf(!isShieldAutoSwitchable()).each(COMBO_PACE_PLANETS)(
    'reaches planet %i core no slower than 0.98x with the shield acting on its own',
    (planet) => {
      const ratios = COMBO_PACE_SEEDS.map((seed) => {
        const { manual, auto } = shieldPaceRunsOn(planet, seed)
        console.log(
          `P${planet} seed ${seed}: manual ${coreTicksOf(manual)}, auto ${coreTicksOf(auto)}`,
        )
        return timeRatioBp(manual, auto)
      })
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )

  it.skipIf(!isShieldAutoSwitchable())(
    'replays the auto shield run to the same digest, as host and guest',
    () => {
      const [planet] = COMBO_PACE_PLANETS
      const [seed] = COMBO_PACE_SEEDS
      const [host, guest] = [autoShieldRunOn(planet, seed), autoShieldRunOn(planet, seed)]
      expect(stateDigest(guest.state)).toBe(stateDigest(host.state))
      expect(guest.events).toHaveLength(host.events.length)
    },
    TIMEOUT_MS,
  )
})
