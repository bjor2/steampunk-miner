import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { SliceRun } from '../../systems/bot/playSlice'
import {
  cementPinDriftBpOf,
  cementPinRunsOf,
  CEMENT_PIN,
  CEMENT_PIN_TOLERANCE_BP,
  isSurvivedPair,
  medianBpOf,
  MIN_CEMENT_PIN_RUNS,
  MIN_SURVIVED_PAIRS,
  playFoamGateRuns,
  type FoamGateRuns,
} from './foamPaceGate'
import {
  collapseDeathsOf,
  foamPaceRunsOn,
  foamSpraysOf,
  FOAM_PACE_PLANETS,
  FOAM_PACE_SEEDS,
  hasRigDied,
  liningShareBpOf,
  type FoamPaceRuns,
} from './foamPaceRuns'
import { coreTicksOf, MIN_TIME_BP, timeRatioBp } from './magnetPaceRuns'

// Stabiliser foam's pace gate (the VS pin on #381, ticket 381, judged as the Systems ruling on
// #664 scopes it): with foam, the lode clamp and the refractory (cement) lining granted together
// and pressed at every chance, the pacing bot reaches each planet's core no faster than 0.98x its
// bare time, judged on the median of the seed pairs where neither rig is destroyed, at least two
// of them (`foamPaceGate.ts`), on foam's planet 3 and the magnet gate's 7 and 10. Where the bare
// rig dies on planet 7 the lining's survival is cement's, pinned on its own. Foam's stack is never
// restocked, so a run sprays it at most four times and the holders buy nothing but lining. Long:
// eighteen or more bot runs, for the box Tester.

const TIMEOUT_MS = 60 * 60 * 1000
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
/** The off-curve spend bar on lining's share of a planet's income (Systems ruling on #664). */
const MAX_LINING_SHARE_BP = 600

/** Each pair is played once per planet and seed, however many checks read it. */
const playedPairs = new Map<string, FoamPaceRuns>()

function runsOnPlanet(planet: number): (seed: number) => FoamPaceRuns {
  return (seed) => {
    const key = `${planet}:${seed}`
    const runs = playedPairs.get(key) ?? foamPaceRunsOn(planet, seed)
    playedPairs.set(key, runs)
    return runs
  }
}

function logGateRuns(planet: number, { played, survived }: FoamGateRuns): void {
  for (const runs of played) console.log(describePair(runs))
  console.log(`P${planet}: ${survived.length} surviving pairs of ${played.length} seeds played`)
  console.log(describeBareCollapseRate(planet, played))
}

function describePair({ planet, seed, bare, withHolders }: FoamPaceRuns): string {
  const outcome = isSurvivedPair({ planet, seed, bare, withHolders }) ? 'judged' : 'left out'
  return (
    `P${planet} seed ${seed}: bare ${describeRun(bare)}, holders ${describeRun(withHolders)}, ` +
    `${foamSpraysOf(withHolders)} sprays (${outcome})`
  )
}

function describeRun(run: SliceRun): string {
  const minutes = (coreTicksOf(run) / TICKS_PER_MINUTE).toFixed(1)
  return hasRigDied(run)
    ? `${minutes} min, destroyed (${collapseDeathsOf(run)} by collapse)`
    : `${minutes} min`
}

/** Done-when 3 of the ruling: the share of the pacing seeds a collapse kills the bare rig on. */
function describeBareCollapseRate(planet: number, played: readonly FoamPaceRuns[]): string {
  const pacing = played.filter((runs) => FOAM_PACE_SEEDS.some((seed) => seed === runs.seed))
  const deaths = pacing.filter((runs) => collapseDeathsOf(runs.bare) > 0).length
  return `P${planet}: bare rig destroyed by a collapse on ${deaths} of ${pacing.length} pacing seeds`
}

describe('stabiliser foam pace (VS pin on #381, Systems ruling on #664)', () => {
  it.each(FOAM_PACE_PLANETS)(
    'keeps time to core at least 0.98x the bare time where both rigs survive on planet %i',
    (planet) => {
      const runs = playFoamGateRuns(runsOnPlanet(planet))
      logGateRuns(planet, runs)
      expect(runs.survived.length).toBeGreaterThanOrEqual(MIN_SURVIVED_PAIRS)
      const ratios = runs.survived.map(({ bare, withHolders }) => timeRatioBp(withHolders, bare))
      expect(medianBpOf(ratios)).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )

  it(
    `keeps the holders' time to core within 5% of cement's pin where the bare rig dies on planet ${CEMENT_PIN.planet}`,
    () => {
      const pinRuns = cementPinRunsOf(runsOnPlanet(CEMENT_PIN.planet))
      for (const runs of pinRuns)
        console.log(`${describePair(runs)}: ${cementPinDriftBpOf(runs)} bp off the pin`)
      expect(pinRuns.length).toBeGreaterThanOrEqual(MIN_CEMENT_PIN_RUNS)
      for (const runs of pinRuns)
        expect(cementPinDriftBpOf(runs)).toBeLessThanOrEqual(CEMENT_PIN_TOLERANCE_BP)
    },
    TIMEOUT_MS,
  )

  it(
    `keeps the holders' lining under 6% of their income on planet ${CEMENT_PIN.planet}`,
    () => {
      const holderRuns = FOAM_PACE_SEEDS.map(runsOnPlanet(CEMENT_PIN.planet)).map(
        (runs) => runs.withHolders,
      )
      const shares = holderRuns.map(liningShareBpOf)
      console.log(`P${CEMENT_PIN.planet} holders' lining share of income: ${shares.join(' / ')} bp`)
      for (const share of shares) expect(share).toBeLessThanOrEqual(MAX_LINING_SHARE_BP)
    },
    TIMEOUT_MS,
  )
})
